"use server";

// كل كتابة في المخزون تمر من هنا.
//
// والفحص هنا طبقة أولى للواجهة لا الحاكم. الحاكم في القاعدة:
//   • grn_verdict          يحكم الشحنة مقبولة أو محجوزة — من حدود الجودة
//   • stock_move_guard     يمنع الإشارة الخاطئة والرصيد السالب والصرف من محجوز
//   • waste_only_via_approval يمنع إدراج هدر في الدفتر خارج مسار الاعتماد
//   • waste_request_judge  يقرّر هل الهدر يحتاج المالك، من قيمته لا من قائله
//   • issue_fefo           يوزّع الصرف بأقرب انتهاء، فما يُختار اللوط باليد
//   • decide_waste         القرار للمالك وحده، ومرّة واحدة
// ورسائل القاعدة عربية ومكتوبة للمستخدم، فتُعرض كما هي.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getStaffSession, type StaffSession } from "@/lib/supabase/auth";
import { Cap, ROLES, can } from "@/lib/ops/roles";
import type { ActionResult } from "@/lib/ops/types";
import type { StorageMode, WasteReason } from "@/lib/ops/inventory";

const DENIED: ActionResult = { ok: false, error: "دورك الحالي ما يملك صلاحية هذا التعديل" };
const PATH = "/admin/ops/inventory";

type Ctx = { session: StaffSession; supabase: Awaited<ReturnType<typeof createClient>> };

async function guard(cap: Cap): Promise<Ctx | ActionResult> {
  const session = await getStaffSession();
  if (!session || !can(session.role, cap)) return DENIED;
  return { session, supabase: await createClient() };
}

function isDenial(v: Ctx | ActionResult): v is ActionResult {
  return "ok" in v;
}

const who = (ctx: Ctx) => ctx.session.name || ctx.session.email;

async function writeAudit(ctx: Ctx, text: string) {
  await ctx.supabase.from("ops_audit").insert({
    user_id: ctx.session.userId,
    role: ROLES[ctx.session.role].label,
    by: who(ctx),
    area: "المخزون",
    text,
  });
}

function done(): ActionResult {
  revalidatePath(PATH);
  return { ok: true };
}

function dbError(message: string): ActionResult {
  if (/row-level security|permission denied/i.test(message)) return DENIED;
  return { ok: false, error: message };
}

// ---------- الاستلام ----------

export async function receiveLot(input: {
  ingredientKey: string;
  supplier: string;
  supplierLot: string;
  expiryDate: string;
  receivedQtyG: number;
  scaleQtyG: number | null;
  storageMode: StorageMode;
  receiptTempC: number | null;
  packagingOk: boolean;
  allergenDeclared: boolean;
}): Promise<ActionResult & { verdict?: string; reason?: string }> {
  const ctx = await guard("inventory.receive");
  if (isDenial(ctx)) return ctx;

  if (!input.ingredientKey) return { ok: false, error: "اختر المكوّن" };
  if (!input.expiryDate) return { ok: false, error: "تاريخ الصلاحية مطلوب" };
  if (!(input.receivedQtyG > 0)) return { ok: false, error: "الكمية لازم تكون أكبر من صفر" };

  const { data, error } = await ctx.supabase
    .from("ops_stock_lots")
    .insert({
      ingredient_key: input.ingredientKey,
      supplier: input.supplier.trim(),
      supplier_lot: input.supplierLot.trim(),
      expiry_date: input.expiryDate,
      received_qty_g: input.receivedQtyG,
      scale_qty_g: input.scaleQtyG,
      storage_mode: input.storageMode,
      receipt_temp_c: input.receiptTempC,
      packaging_ok: input.packagingOk,
      allergen_declared: input.allergenDeclared,
      received_by: ctx.session.userId,
      received_by_name: who(ctx),
    })
    .select("id, verdict, verdict_reason")
    .maybeSingle();
  if (error) return dbError(error.message);

  // حركة الاستلام يولّدها محفّز lot_receipt_move في نفس المعاملة — ما
  // نُدرجها هنا: عبارتان منفصلتان تتركان لوطاً مقبولاً برصيد صفر لو فشلت
  // الثانية.
  //
  // القاعدة هي اللي حكمت، فالرسالة تنقل حكمها لا توقّعنا
  await writeAudit(ctx, `استلام ${input.ingredientKey} · ${data?.verdict === "ACCEPT" ? "مقبول" : "محجوز"}`);
  revalidatePath(PATH);
  return { ok: true, verdict: String(data?.verdict ?? ""), reason: String(data?.verdict_reason ?? "") };
}

// ---------- قرار المالك على المحجوز ----------

export async function decideLot(input: {
  lotId: number;
  accept: boolean;
  note: string;
}): Promise<ActionResult> {
  const ctx = await guard("inventory.decide");
  if (isDenial(ctx)) return ctx;

  const { data, error } = await ctx.supabase
    .from("ops_stock_lots")
    .update({
      verdict: input.accept ? "ACCEPT" : "REJECT",
      decided_by: ctx.session.userId,
      decided_by_name: who(ctx),
      decided_at: new Date().toISOString(),
      decision_note: input.note.trim(),
    })
    .eq("id", input.lotId)
    .eq("verdict", "HOLD")
    .select("id")
    .maybeSingle();
  if (error) return dbError(error.message);
  if (!data) return { ok: false, error: "الطلب غير موجود أو محسوم مسبقاً" };

  // فكّ الحجز يُدخل الكمية الدفتر عبر محفّز lot_release_move، في نفس
  // المعاملة التي غيّرت الحالة.
  await writeAudit(ctx, `${input.accept ? "فكّ حجز" : "رفض"} لوط #${input.lotId}`);
  return done();
}

// ---------- الصرف للإنتاج ----------

export async function issueToProduction(input: {
  ingredientKey: string;
  qtyG: number;
  batchNo: string;
  note: string;
}): Promise<ActionResult & { lots?: number }> {
  const ctx = await guard("inventory.issue");
  if (isDenial(ctx)) return ctx;

  if (!input.ingredientKey) return { ok: false, error: "اختر المكوّن" };
  if (!(input.qtyG > 0)) return { ok: false, error: "الكمية لازم تكون أكبر من صفر" };
  if (!input.batchNo.trim()) return { ok: false, error: "رقم دفعة الإنتاج مطلوب" };

  // التوزيع على اللوطات في القاعدة لا هنا: FEFO قاعدة تشغيل، وتركها
  // للواجهة يعني أن مَن ينادي الـAPI مباشرة يختار اللوط اللي يبيه.
  const { data, error } = await ctx.supabase.rpc("issue_fefo", {
    p_ingredient_key: input.ingredientKey,
    p_qty_g: input.qtyG,
    p_batch_no: input.batchNo.trim(),
    p_note: input.note.trim(),
  });
  if (error) return dbError(error.message);

  const lots = Array.isArray(data) ? data.length : 0;
  await writeAudit(ctx, `صرف ${input.qtyG}غ من ${input.ingredientKey} لدفعة ${input.batchNo} · ${lots} لوط`);
  revalidatePath(PATH);
  return { ok: true, lots };
}

// ---------- الهدر ----------

export async function raiseWaste(input: {
  lotId: number;
  qtyG: number;
  reason: WasteReason;
  note: string;
}): Promise<ActionResult & { status?: string; value?: number }> {
  const ctx = await guard("inventory.issue");
  if (isDenial(ctx)) return ctx;

  if (!(input.qtyG > 0)) return { ok: false, error: "الكمية لازم تكون أكبر من صفر" };

  const { data, error } = await ctx.supabase
    .from("ops_waste_requests")
    .insert({
      lot_id: input.lotId,
      qty_g: input.qtyG,
      reason: input.reason,
      note: input.note.trim(),
      raised_by: ctx.session.userId,
      raised_by_name: who(ctx),
    })
    .select("status, value_sar")
    .maybeSingle();
  if (error) return dbError(error.message);

  await writeAudit(ctx, `هدر ${input.qtyG}غ من لوط #${input.lotId} · ${data?.status === "PENDING" ? "بانتظار المالك" : "معتمد تلقائياً"}`);
  revalidatePath(PATH);
  return { ok: true, status: String(data?.status ?? ""), value: Number(data?.value_sar ?? 0) };
}

export async function decideWaste(input: {
  id: number;
  approve: boolean;
  note: string;
}): Promise<ActionResult> {
  const ctx = await guard("inventory.decide");
  if (isDenial(ctx)) return ctx;

  const { error } = await ctx.supabase.rpc("decide_waste", {
    p_id: input.id,
    p_approve: input.approve,
    p_note: input.note.trim(),
  });
  if (error) return dbError(error.message);

  await writeAudit(ctx, `${input.approve ? "اعتماد" : "رفض"} هدر #${input.id}`);
  return done();
}

// ---------- الجرد ----------

export async function recordStocktake(input: {
  lotId: number;
  countedG: number;
  note: string;
}): Promise<ActionResult> {
  const ctx = await guard("inventory.issue");
  if (isDenial(ctx)) return ctx;

  if (input.countedG < 0) return { ok: false, error: "العدّ ما يكون سالباً" };

  const { error } = await ctx.supabase.from("ops_stocktakes").insert({
    lot_id: input.lotId,
    counted_g: input.countedG,
    note: input.note.trim(),
    counted_by: ctx.session.userId,
    counted_by_name: who(ctx),
  });
  if (error) return dbError(error.message);

  await writeAudit(ctx, `جرد لوط #${input.lotId} · عُدَّ ${input.countedG}غ`);
  return done();
}

// ---------- تسعير الشحنة — المالي ----------

export async function priceLot(input: {
  lotId: number;
  invoicePriceSar: number;
  invoiceNo: string;
}): Promise<ActionResult & { variance?: number | null }> {
  const ctx = await guard("inventory.price");
  if (isDenial(ctx)) return ctx;

  if (!(input.invoicePriceSar >= 0)) return { ok: false, error: "السعر ما يكون سالباً" };

  // الانحراف وبصمة المسعِّر يكتبهما محفّز lot_price_role — ما نرسلهما:
  // التوقيع على رقم مالي ما يُترك لمرسِل الطلب يملأه بما يشاء.
  const { data, error } = await ctx.supabase
    .from("ops_stock_lots")
    .update({ invoice_price_sar: input.invoicePriceSar, invoice_no: input.invoiceNo.trim() })
    .eq("id", input.lotId)
    .select("price_variance_pct")
    .maybeSingle();
  if (error) return dbError(error.message);
  if (!data) return { ok: false, error: "الشحنة غير موجودة أو خارج صلاحيتك" };

  await writeAudit(ctx, `تسعير لوط #${input.lotId} بـ${input.invoicePriceSar} ر.س/كجم`);
  revalidatePath(PATH);
  return { ok: true, variance: data.price_variance_pct === null ? null : Number(data.price_variance_pct) };
}
