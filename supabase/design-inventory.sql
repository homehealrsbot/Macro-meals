-- ============================================================================
-- تصميم مقترح: المخزون باللوطات — مقروء لا مطبَّق
-- ============================================================================
--
-- هذا الملف للمراجعة. ما يُشغَّل على القاعدة إلا بعد موافقة المالك.
--
-- القاعدة الحاكمة: الرصيد ما يُكتب، يُشتق. ما فيه عمود «الكمية المتبقية»
-- يعدّله أحد — الرصيد مجموع الحركات. عمود رصيد يُكتب باليد يُفرَّغ المخزون
-- بسطرٍ واحد وما يبقى أثر؛ والدفتر لا يُمحى منه شي، فالخطأ يُصحَّح بحركة
-- مضادة تبقى مرئية.
--
-- وهذا امتداد لما في النظام: حكم الـyield يحسبه محفّز لا يكتبه المطبخ،
-- وعمود passed في سجل المراقبة كذلك. المخزون ياخذ نفس المعاملة.
--
-- والأدوار أدوارنا الأربعة (executive = المالك/الادمن · finance · kitchen ·
-- quality)، لا ثلاثة أدوار جديدة. والمكوّن هو ops_ingredients.key، ما نبني
-- سجل أصناف ثانياً يفترق عن الوصفات أول ما يُعدَّل أحدهما.


-- ============================================================================
-- 1) الأنواع
-- ============================================================================

-- حكم الاستلام. يحسبه المحفّز ACCEPT أو HOLD فقط — وREJECT قرار بشري
-- للمالك وحده. لو قدر المحفّز يرفض، صار رفض الشحنة حدثاً بلا مسؤول.
create type grn_verdict as enum ('ACCEPT', 'HOLD', 'REJECT');

-- نوع الحركة. THAW حركة بلا كمية صافية (وزن قبل/بعد التذويب) لكنها تُسجَّل
-- عشان يُقاس الفقد؛ فقدها الفعلي يُنزَّل بحركة WASTE مستقلة.
create type stock_move_kind as enum ('RECEIPT', 'ISSUE', 'WASTE', 'ADJUST', 'THAW');

create type waste_reason as enum (
  'EXPIRED', 'DAMAGED', 'COLD_CHAIN', 'CONTAMINATION',
  'PREP_ERROR', 'SUPPLIER_RETURN', 'OTHER'
);


-- ============================================================================
-- 2) اللوط — شحنة واحدة من مكوّن واحد
-- ============================================================================
--
-- سعر الوحدة لقطة من ops_ingredients.price يكتبها المحفّز، ما يكتبها المستلِم.
-- السبب قرارك السابق: السعر للمالي وحده. ولو كان حقلاً يُملأ عند الاستلام،
-- كتب المطبخ سعر الشراء وانتقلت ملكية الرقم من المالي للمطبخ بلا قرار.
-- واللقطة ضرورية مع ذلك: السعر يتغيّر، وتقييم مخزون اليوم بسعر الغد خطأ.
-- (نفس نمط spec_yield_pct في ops_yield_checks.)

create table ops_stock_lots (
  id                bigserial primary key,
  ingredient_key    text not null references ops_ingredients(key),

  -- هوية الشحنة عند المورد
  supplier          text not null default '',
  supplier_lot      text not null default '',
  production_date   date,
  expiry_date       date not null,

  -- الكميات بالغرام دائماً. التحويل من كرتون/باليت يصير في الواجهة قبل
  -- الحفظ: وحدتان مخزَّنتان في جدول واحد تعني جمع تفاح على برتقال أول
  -- استعلام يغفل عن عمود الوحدة.
  received_qty_g    numeric(12,2) not null check (received_qty_g > 0),
  scale_qty_g       numeric(12,2) check (scale_qty_g > 0),   -- وزننا نحن

  -- شروط الاستلام
  receipt_temp_c    numeric(5,2),
  packaging_ok      boolean not null default true,
  allergen_declared boolean not null default true,

  -- محسوبة بالمحفّز — لا تُكتب
  unit_price_snap   numeric(10,2),        -- ر.س/كجم وقت الاستلام
  verdict           grn_verdict not null default 'HOLD',
  verdict_reason    text not null default '',

  -- قرار المالك على المحجوز
  decided_by        uuid references auth.users(id),
  decided_by_name   text not null default '',
  decided_at        timestamptz,
  decision_note     text not null default '',

  received_by       uuid references auth.users(id),
  received_by_name  text not null default '',
  received_at       timestamptz not null default now()
);

create index idx_stock_lots_ing    on ops_stock_lots(ingredient_key, expiry_date);
create index idx_stock_lots_expiry on ops_stock_lots(expiry_date) where verdict = 'ACCEPT';

comment on table ops_stock_lots is
  'شحنة مستلمة من مكوّن. حكم الاستلام يحسبه محفّز؛ وفكّ الحجز أو الرفض للمالك.';


-- ============================================================================
-- 3) دفتر الحركات — مصدر الرصيد الوحيد
-- ============================================================================
--
-- الكمية موجبة داخلة وسالبة خارجة، في عمود واحد. عمودان (وارد/منصرف)
-- يسمحان بصفٍّ فيه الاثنان، ويضاعفان كل استعلام. والإشارة يحرسها محفّز
-- عشان ما يُسجَّل صرفٌ بموجب فيزيد الرصيد بدل ما ينقص.
--
-- append-only: ما فيه update ولا delete في السياسات. التصحيح حركة ADJUST
-- مضادة. دفتر يُعدَّل ليس دفتراً.

create table ops_stock_moves (
  id            bigserial primary key,
  lot_id        bigint not null references ops_stock_lots(id),
  kind          stock_move_kind not null,
  qty_g         numeric(12,2) not null check (qty_g <> 0),

  batch_no      text not null default '',     -- دفعة الإنتاج عند الصرف
  waste_reason  waste_reason,

  -- التذويب: وزن بعد التذويب مقابل المصروف. هذا فقدٌ على لوط المكوّن،
  -- غير yield الطبخ (نيّئ→مطبوخ) اللي على الصنف النهائي في ops_yield_checks.
  -- شيئان مختلفان: يتعايشان ولا يُدمجان.
  post_thaw_g   numeric(12,2) check (post_thaw_g > 0),
  thaw_loss_pct numeric(7,4),                 -- يحسبها المحفّز

  note          text not null default '',
  ref           text not null default '',
  moved_by      uuid references auth.users(id),
  moved_by_name text not null default '',
  moved_at      timestamptz not null default now()
);

create index idx_stock_moves_lot   on ops_stock_moves(lot_id, moved_at);
create index idx_stock_moves_batch on ops_stock_moves(batch_no) where batch_no <> '';

comment on table ops_stock_moves is
  'دفتر حركات المخزون. موجب داخل وسالب خارج. لا يُعدَّل ولا يُحذف: التصحيح حركة مضادة.';


-- ============================================================================
-- 4) الجرد
-- ============================================================================
--
-- الفرق يحسبه المحفّز من الرصيد الدفتري لحظة الجرد، ثم ينزّله حركة ADJUST.
-- لو كُتب الفرق باليد صار الجرد إعلاناً لا قياساً.

create table ops_stocktakes (
  id            bigserial primary key,
  lot_id        bigint not null references ops_stock_lots(id),
  counted_g     numeric(12,2) not null check (counted_g >= 0),
  system_g      numeric(12,2),                -- لقطة دفترية، يكتبها المحفّز
  diff_g        numeric(12,2),                -- يحسبها المحفّز
  move_id       bigint references ops_stock_moves(id),   -- حركة التسوية
  note          text not null default '',
  counted_by    uuid references auth.users(id),
  counted_by_name text not null default '',
  counted_at    timestamptz not null default now()
);


-- ============================================================================
-- 5) نقطة إعادة الطلب — عمود على المكوّن لا جدول
-- ============================================================================
-- جدول بصفّ واحد لكل مكوّن هو ops_ingredients بأسماء أخرى.

alter table ops_ingredients add column reorder_point_g numeric(12,2) not null default 0;


-- ============================================================================
-- 6) الرصيد — مشتقّ
-- ============================================================================

create or replace view ops_lot_balance_v as
select
  l.id                                       as lot_id,
  l.ingredient_key,
  l.expiry_date,
  l.verdict,
  coalesce(sum(m.qty_g), 0)                  as balance_g,
  -- صالح للصرف: مقبول، وغير منتهٍ، وله رصيد
  (l.verdict = 'ACCEPT'
   and l.expiry_date >= current_date
   and coalesce(sum(m.qty_g), 0) > 0)        as issuable
from ops_stock_lots l
left join ops_stock_moves m on m.lot_id = l.id
group by l.id;

-- الرصيد لكل مكوّن + أقرب انتهاء + القيمة. القيمة من سعر المالي الحالي،
-- والتكلفة التاريخية من لقطة اللوط — رقمان مختلفان عن قصد.
create or replace view ops_stock_on_hand_v as
select
  i.key                                      as ingredient_key,
  i.name,
  i.reorder_point_g,
  coalesce(sum(b.balance_g) filter (where b.issuable), 0) as usable_g,
  coalesce(sum(b.balance_g), 0)                           as total_g,
  min(b.expiry_date) filter (where b.issuable)            as nearest_expiry,
  coalesce(sum(b.balance_g) filter (where b.issuable), 0) / 1000 * i.price as value_sar,
  coalesce(sum(b.balance_g) filter (where b.issuable), 0) < i.reorder_point_g as below_reorder
from ops_ingredients i
left join ops_lot_balance_v b on b.ingredient_key = i.key
where i.active
group by i.key, i.name, i.reorder_point_g, i.price;


-- ============================================================================
-- 7) المحفّزات — الأحكام تُحسب هنا
-- ============================================================================

-- ---------- حكم الاستلام ----------
-- ACCEPT أو HOLD فقط. وغياب المفتاح من الإعدادات يعني الافتراضي المكتوب هنا
-- لا تساهلاً مفتوحاً — نفس مبدأ yieldTolerancePct.
create or replace function private.tg_grn_verdict() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s          jsonb;
  v_min_days int;
  v_wt_tol   numeric;
  v_reasons  text[] := '{}';
begin
  select data into s from ops_settings where id = 1;
  v_min_days := coalesce((s->>'minShelfLifeDaysAtReceipt')::int, 30);
  v_wt_tol   := coalesce((s->>'weightTolerancePct')::numeric, 0.02);

  -- لقطة السعر من رقم المالي، لا من المستلِم
  select price into new.unit_price_snap from ops_ingredients where key = new.ingredient_key;

  if new.expiry_date - current_date < v_min_days then
    v_reasons := v_reasons || format('صلاحية متبقية %s يوم < %s', new.expiry_date - current_date, v_min_days);
  end if;

  if new.scale_qty_g is not null
     and abs(new.scale_qty_g - new.received_qty_g) / new.received_qty_g > v_wt_tol then
    v_reasons := v_reasons || format('فرق وزن %s%%', round(abs(new.scale_qty_g - new.received_qty_g) / new.received_qty_g * 100, 1));
  end if;

  if not new.packaging_ok      then v_reasons := v_reasons || 'تغليف غير سليم'; end if;
  if not new.allergen_declared then v_reasons := v_reasons || 'إقرار المورد بمسببات الحساسية ناقص'; end if;

  if array_length(v_reasons, 1) is null then
    new.verdict := 'ACCEPT'; new.verdict_reason := '';
  else
    new.verdict := 'HOLD';   new.verdict_reason := array_to_string(v_reasons, ' · ');
  end if;

  return new;
end $$;

create trigger grn_verdict before insert on ops_stock_lots
  for each row execute function private.tg_grn_verdict();


-- ---------- حراسة الحركة ----------
-- الإشارة، والرصيد السالب، والصرف من لوط محجوز أو منتهٍ — كلها تُمنع هنا لا
-- في الواجهة. حارسٌ في الواجهة يُتجاوز بطلب HTTP مباشر.
create or replace function private.tg_stock_move_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_lot     ops_stock_lots;
  v_balance numeric;
begin
  select * into v_lot from ops_stock_lots where id = new.lot_id;
  if v_lot.id is null then
    raise exception 'لوط غير موجود: %', new.lot_id;
  end if;

  if new.kind = 'RECEIPT' and new.qty_g <= 0 then
    raise exception 'حركة الاستلام موجبة';
  end if;
  if new.kind in ('ISSUE', 'WASTE') and new.qty_g >= 0 then
    raise exception 'حركة الصرف أو الهدر سالبة';
  end if;

  if new.kind = 'ISSUE' then
    if v_lot.verdict <> 'ACCEPT' then
      raise exception 'لوط غير مقبول: %', v_lot.verdict;
    end if;
    if v_lot.expiry_date < current_date then
      raise exception 'لوط منتهي الصلاحية بتاريخ %', v_lot.expiry_date;
    end if;
  end if;

  -- الرصيد ما ينزل تحت الصفر لأي سبب
  select coalesce(sum(qty_g), 0) into v_balance from ops_stock_moves where lot_id = new.lot_id;
  if v_balance + new.qty_g < 0 then
    raise exception 'الرصيد % غرام لا يكفي لحركة % غرام', v_balance, new.qty_g;
  end if;

  -- فقد التذويب
  if new.post_thaw_g is not null then
    new.thaw_loss_pct := round((abs(new.qty_g) - new.post_thaw_g) / abs(new.qty_g), 4);
  end if;

  return new;
end $$;

create trigger stock_move_guard before insert on ops_stock_moves
  for each row execute function private.tg_stock_move_guard();


-- ---------- الجرد: الفرق يُحسب ويُنزَّل حركة ----------
-- بعد الإدراج لا قبله: التسوية حركة في ops_stock_moves تحتاج id الجرد،
-- وid ما يوجد قبل ما يُدرج الصف. والفرق من رصيد اللحظة لا من رقم يُكتب.
create or replace function private.tg_stocktake_settle() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_system numeric;
  v_diff   numeric;
  v_move   bigint;
begin
  select coalesce(sum(qty_g), 0) into v_system from ops_stock_moves where lot_id = new.lot_id;
  v_diff := new.counted_g - v_system;

  if v_diff <> 0 then
    insert into ops_stock_moves (lot_id, kind, qty_g, note, ref, moved_by, moved_by_name)
    values (new.lot_id, 'ADJUST', v_diff, 'تسوية جرد', 'stocktake:' || new.id,
            new.counted_by, new.counted_by_name)
    returning id into v_move;
  end if;

  update ops_stocktakes
     set system_g = v_system, diff_g = v_diff, move_id = v_move
   where id = new.id;

  return null;
end $$;

create trigger stocktake_settle after insert on ops_stocktakes
  for each row execute function private.tg_stocktake_settle();


-- ============================================================================
-- 8) الصرف بـFEFO — دالّة لا منطق واجهة
-- ============================================================================
--
-- توزيع الكمية على اللوطات بأقرب انتهاء. في الواجهة يعني أن مَن يستدعي الـAPI
-- مباشرة يختار اللوط اللي يبيه ويترك القديم يفسد؛ وهذا بالضبط ما يمنعه FEFO.

create or replace function public.issue_fefo(
  p_ingredient_key text, p_qty_g numeric, p_batch_no text, p_note text default ''
) returns setof ops_stock_moves
language plpgsql security definer set search_path = public as $$
declare
  v_left numeric := p_qty_g;
  v_take numeric;
  v_name text;
  r      record;
begin
  if not private.has_role(array['kitchen']::staff_role[]) then
    raise exception 'الصرف للمطبخ أو المالك';
  end if;
  if p_qty_g <= 0 then raise exception 'الكمية موجبة'; end if;

  select name into v_name from staff where user_id = auth.uid();
  v_name := coalesce(v_name, '');

  for r in
    select lot_id, balance_g from ops_lot_balance_v
    where ingredient_key = p_ingredient_key and issuable
    order by expiry_date, lot_id
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.balance_g);
    return query
      insert into ops_stock_moves (lot_id, kind, qty_g, batch_no, note, moved_by, moved_by_name)
      values (r.lot_id, 'ISSUE', -v_take, p_batch_no, p_note, auth.uid(), v_name)
      returning *;
    v_left := v_left - v_take;
  end loop;

  if v_left > 0 then
    raise exception 'نقص % غرام من %', v_left, p_ingredient_key;
  end if;
end $$;


-- ============================================================================
-- 9) الصلاحيات — أدوارنا الأربعة
-- ============================================================================

alter table ops_stock_lots  enable row level security;
alter table ops_stock_moves enable row level security;
alter table ops_stocktakes  enable row level security;

-- الكل يقرأ. المخزون معلومة تشغيلية، وإخفاؤها عن الجودة يعني مراجعة عمياء.
create policy "staff reads lots"  on ops_stock_lots  for select to authenticated using (private.is_staff());
create policy "staff reads moves" on ops_stock_moves for select to authenticated using (private.is_staff());
create policy "staff reads takes" on ops_stocktakes  for select to authenticated using (private.is_staff());

-- الاستلام: المطبخ (وقرارك السابق: المطبخ يسوي إدخالات المكوّنات).
create policy "kitchen receives" on ops_stock_lots
  for insert to authenticated
  with check (private.has_role(array['kitchen']::staff_role[]));

-- فكّ الحجز أو الرفض: المالك وحده، ومن حالة HOLD فقط. ولو سُمح من ACCEPT
-- صار بالإمكان قلب لوط مقبول إلى مرفوض بعد صرفه.
create policy "owner decides held lots" on ops_stock_lots
  for update to authenticated
  using (private.current_staff_role() = 'executive' and verdict = 'HOLD')
  with check (private.current_staff_role() = 'executive' and verdict in ('ACCEPT', 'REJECT'));

-- الحركات: insert فقط، بلا update ولا delete لأحد — المالك كذلك.
-- صلاحية المالك المطلقة في النظام صلاحية قرار، لا صلاحية محو أثر.
create policy "staff records moves" on ops_stock_moves
  for insert to authenticated with check (private.is_staff());

create policy "staff counts" on ops_stocktakes
  for insert to authenticated with check (private.is_staff());

grant select on ops_lot_balance_v, ops_stock_on_hand_v to authenticated;
grant select, insert on ops_stock_lots  to authenticated;
grant update (verdict, decided_by, decided_by_name, decided_at, decision_note) on ops_stock_lots to authenticated;
grant select, insert on ops_stock_moves to authenticated;
grant select, insert on ops_stocktakes  to authenticated;
grant usage, select on sequence ops_stock_lots_id_seq, ops_stock_moves_id_seq, ops_stocktakes_id_seq to authenticated;


-- ============================================================================
-- 10) مفاتيح الإعدادات الجديدة (ops_settings.data)
-- ============================================================================
--   minShelfLifeDaysAtReceipt  30     أقل صلاحية متبقية تُقبل
--   weightTolerancePct         0.02   فرق الوزن المسموح عند الاستلام
--   thawLossTolerancePct       0.08   فقد التذويب المقبول
--   expiryWarnDays             7      تنبيه اقتراب الانتهاء
--   wasteApprovalLimitSar      200    فوقه يروح الهدر للمالك
--
-- سؤال مفتوح — حدود الحرارة:
-- النظام عنده أصلاً حدود النقاط الحرجة صفوفاً تحددها الجودة (القسم 7.6).
-- وحرارة الاستلام هنا تحتاج حدّاً كذلك. وضعها في ops_settings يعني مصدرَي
-- حقيقة لنفس الرقم. الأنظف ربطها بصفوف الجودة — لكن هذا قرارك:
--   (أ) ربطها بحدود الجودة الموجودة، أو
--   (ب) رقم مستقل للاستلام في الإعدادات.
-- تركت المحفّز بلا فحص حرارة لين تختار، عشان ما أثبّت مصدراً ثانياً بالغلط.


-- ============================================================================
-- 11) ما لم أضعه، وليش
-- ============================================================================
--
-- • جسر إكسل بالنسخ واللصق: لا. الاحتياج يُحسب (وصفة × خطة) من نفس القاعدة.
--   اللصق اليدوي يعني رقماً خاطئاً يدخل بلا ما يمسكه شي، وهو نقيض كل
--   المحفّزات أعلاه.
--
-- • «حساب claude.ai اللي نفّذ الحركة»: لا. النسبة للموظف عبر auth.uid()
--   و staff، زي recorded_by في كل جداولنا. سجل تدقيق يقول «مين شغّل الأداة»
--   بدل «مين سوّى الشغل» ما يمشي في تدقيق سلامة غذاء.
--
-- • سجل أصناف مستقل: لا. المكوّن ops_ingredients.key. سجلّان يفترقان أول
--   ما يُعدَّل أحدهما، فيصير مخزون مكوّنٍ ما له وصفة.
--
-- • عمود رصيد على اللوط: لا. مشتقّ من الدفتر (القسم 6).
