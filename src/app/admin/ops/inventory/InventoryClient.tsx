"use client";

// المخزون: الرصيد، والاستلام، والصرف والهدر، وقرارات المالك — في شاشة
// واحدة بتبويبات.
//
// وحدة واحدة في الشريط لا أربع: أمين المستودع يشتغل في مكان واحد، وتفريق
// الاستلام عن الصرف عن الرصيد على أربع صفحات يجعله يتنقّل بينها في كل
// عملية. والتبويبات تظهر حسب الدور: ما يشوف المطبخ تبويب القرارات، ولا
// يشوف المالي تبويب الاستلام.
//
// وكل الأحكام تجي من القاعدة: مقبول/محجوز، وتوزيع FEFO، وهل الهدر يحتاج
// المالك. الواجهة تعرض وتنقل الرسالة، ما تحكم.

import { Fragment, useMemo, useState, useTransition } from "react";
import {
  PackagePlus, Boxes, ArrowDownToLine, Trash2, ShieldCheck,
  AlertTriangle, CheckCircle2, XCircle, Thermometer, CalendarClock,
} from "lucide-react";
import { can } from "@/lib/ops/roles";
import { useSession } from "@/lib/ops/session";
import {
  STORAGE_LABEL, WASTE_REASON_LABEL,
  type InventorySnapshot, type LotRow, type StorageMode, type WasteReason,
} from "@/lib/ops/inventory";
import {
  AccessNote, Card, CardTitle, ErrorNote, Kpi, NumInput, OpsShell,
  Pill, T, Td, Th, TableWrap, num, sar,
} from "@/components/ops/ui";
import * as actions from "./actions";

type Tab = "stock" | "receive" | "issue" | "decide";

export default function InventoryClient({ snap }: { snap: InventorySnapshot }) {
  const session = useSession();
  const role = session?.role ?? null;
  const canReceive = can(role, "inventory.receive");
  const canIssue = can(role, "inventory.issue");
  const canDecide = can(role, "inventory.decide");

  const heldLots = useMemo(() => snap.lots.filter((l) => l.verdict === "HOLD"), [snap.lots]);
  const pendingWaste = useMemo(() => snap.waste.filter((w) => w.status === "PENDING"), [snap.waste]);
  const decisionCount = heldLots.length + pendingWaste.length;

  const tabs: { key: Tab; label: string; show: boolean; badge?: number }[] = [
    { key: "stock", label: "الرصيد", show: true },
    { key: "receive", label: "استلام", show: canReceive },
    { key: "issue", label: "صرف وهدر", show: canIssue },
    { key: "decide", label: "قرارات", show: canDecide, badge: decisionCount },
  ];
  const visible = tabs.filter((t) => t.show);
  const [tab, setTab] = useState<Tab>(canDecide && decisionCount > 0 ? "decide" : "stock");

  const expiringSoon = useMemo(() => {
    const limit = new Date();
    limit.setDate(limit.getDate() + snap.expiryWarnDays);
    const iso = limit.toISOString().slice(0, 10);
    return snap.lots.filter((l) => l.issuable && l.expiryDate <= iso);
  }, [snap.lots, snap.expiryWarnDays]);

  const totalValue = snap.stock.reduce((a, r) => a + r.valueSar, 0);
  const belowReorder = snap.stock.filter((r) => r.belowReorder && r.reorderPointG > 0);

  return (
    <OpsShell title="المخزون" subtitle="اللوطات بالصرف الأقرب انتهاءً أولاً — والأحكام من القاعدة">
      <AccessNote
        canEdit={canReceive || canIssue || canDecide}
        editText="تقدر تسجّل حركات المخزون حسب دورك"
        viewText="عرض فقط — الاستلام والصرف للمطبخ، والقرارات للمالك"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi label="قيمة المخزون" value={sar(totalValue)} />
        <Kpi label="مكوّنات تحت نقطة الطلب" value={num(belowReorder.length)} tone={belowReorder.length ? "warn" : undefined} />
        <Kpi label={`قارب على الانتهاء (${snap.expiryWarnDays} يوم)`} value={num(expiringSoon.length)} tone={expiringSoon.length ? "warn" : undefined} />
        <Kpi label="ينتظر قرارك" value={num(decisionCount)} tone={decisionCount ? "hold" : undefined} />
      </div>

      <div className="flex gap-2 flex-wrap mb-4 print:hidden">
        {visible.map((t) => (
          <Pill key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
            {t.badge ? ` · ${t.badge}` : ""}
          </Pill>
        ))}
      </div>

      {tab === "stock" && <StockTab snap={snap} />}
      {tab === "receive" && canReceive && <ReceiveTab snap={snap} />}
      {tab === "issue" && canIssue && <IssueTab snap={snap} />}
      {tab === "decide" && canDecide && <DecideTab snap={snap} held={heldLots} pending={pendingWaste} />}
    </OpsShell>
  );
}

// ============================================================ الرصيد

function StockTab({ snap }: { snap: InventorySnapshot }) {
  const [open, setOpen] = useState<string | null>(null);
  const withStock = snap.stock.filter((r) => r.totalG > 0 || r.reorderPointG > 0);

  if (withStock.length === 0) {
    return (
      <Card>
        <div className="p-8 text-center text-sm" style={{ color: T.inkSoft }}>
          ما فيه رصيد بعد. سجّل أول شحنة من تبويب «استلام».
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle icon={<Boxes size={16} />}>الرصيد لكل مكوّن</CardTitle>
      <TableWrap minWidth={720}>
        <thead>
          <tr>
            <Th>المكوّن</Th>
            <Th className="text-center">المتاح</Th>
            <Th className="text-center">الإجمالي</Th>
            <Th className="text-center">أقرب انتهاء</Th>
            <Th className="text-center">القيمة</Th>
            <Th className="text-center">نقطة الطلب</Th>
          </tr>
        </thead>
        <tbody>
          {withStock.map((r) => {
            const lots = snap.lots.filter((l) => l.ingredientKey === r.key && l.balanceG !== 0);
            const isOpen = open === r.key;
            return (
              <Fragment key={r.key}>
                <tr
                  onClick={() => setOpen(isOpen ? null : r.key)}
                  className="cursor-pointer"
                  style={{ background: isOpen ? T.brandTint : undefined }}
                >
                  <Td strong>{r.name}</Td>
                  <Td className="text-center num">{num(r.usableG)} غ</Td>
                  <Td className="text-center num">{num(r.totalG)} غ</Td>
                  <Td className="text-center num">{r.nearestExpiry ?? "—"}</Td>
                  <Td className="text-center num">{sar(r.valueSar)}</Td>
                  <Td className="text-center">
                    {r.reorderPointG > 0 ? (
                      <span
                        className="num text-[11px] font-bold rounded-full px-2 py-0.5"
                        style={r.belowReorder ? { background: T.warnTint, color: T.warn } : undefined}
                      >
                        {num(r.reorderPointG)} غ
                      </span>
                    ) : "—"}
                  </Td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={6} className="p-0 border-t" style={{ borderColor: T.border }}>
                      <div className="p-3" style={{ background: T.bg }}>
                        <div className="text-[11px] font-bold mb-2" style={{ color: T.inkSoft }}>
                          اللوطات بترتيب الصرف — الأقرب انتهاءً أولاً
                        </div>
                        {lots.length === 0 ? (
                          <div className="text-xs" style={{ color: T.inkSoft }}>ما فيه لوطات برصيد.</div>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {[...lots].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)).map((l) => (
                              <LotLine key={l.id} lot={l} />
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </TableWrap>
    </Card>
  );
}

function LotLine({ lot }: { lot: LotRow }) {
  return (
    <div
      className="flex items-center gap-3 flex-wrap rounded-lg px-3 py-2 text-xs"
      style={{ background: "#FFFFFF", border: `1px solid ${T.border}` }}
    >
      <span className="num font-extrabold">#{lot.id}</span>
      <span className="num font-bold">{num(lot.balanceG)} غ</span>
      <span className="num flex items-center gap-1" style={{ color: T.inkSoft }}>
        <CalendarClock size={12} /> {lot.expiryDate}
      </span>
      <span style={{ color: T.inkSoft }}>{STORAGE_LABEL[lot.storageMode]}</span>
      {lot.supplier && <span style={{ color: T.inkSoft }}>{lot.supplier}</span>}
      {lot.supplierLot && <span className="num" style={{ color: T.inkSoft }}>لوط المورد {lot.supplierLot}</span>}
      {!lot.issuable && (
        <span className="text-[10px] font-bold rounded-full px-2 py-0.5" style={{ background: T.warnTint, color: T.warn }}>
          غير قابل للصرف
        </span>
      )}
    </div>
  );
}

// ============================================================ الاستلام

function ReceiveTab({ snap }: { snap: InventorySnapshot }) {
  const [key, setKey] = useState("");
  const [supplier, setSupplier] = useState("");
  const [lot, setLot] = useState("");
  const [expiry, setExpiry] = useState("");
  const [qty, setQty] = useState<number | null>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [mode, setMode] = useState<StorageMode>("CHILLED");
  const [temp, setTemp] = useState<number | null>(null);
  const [pkg, setPkg] = useState(true);
  const [allergen, setAllergen] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setMsg(null);
    start(async () => {
      const r = await actions.receiveLot({
        ingredientKey: key,
        supplier,
        supplierLot: lot,
        expiryDate: expiry,
        receivedQtyG: qty ?? 0,
        scaleQtyG: scale,
        storageMode: mode,
        receiptTempC: temp,
        packagingOk: pkg,
        allergenDeclared: allergen,
      });
      if (!r.ok) {
        setMsg({ ok: false, text: r.error ?? "تعذّر الحفظ" });
        return;
      }
      // حكم القاعدة يُنقل كما هو — ما نعيد حسابه هنا
      setMsg(
        r.verdict === "ACCEPT"
          ? { ok: true, text: "الشحنة مقبولة ودخلت المخزون." }
          : { ok: false, text: `الشحنة محجوزة: ${r.reason} — تنتظر قرار المالك.` },
      );
      setLot(""); setQty(null); setScale(null); setTemp(null);
    });
  }

  const needsTemp = mode === "CHILLED" || mode === "FROZEN";

  return (
    <Card>
      <CardTitle icon={<PackagePlus size={16} />}>استلام شحنة</CardTitle>
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="المكوّن">
          <select
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="rounded-lg border px-2 py-2 text-sm w-full"
            style={{ borderColor: T.border, background: "#FFFDF5", color: T.ink }}
          >
            <option value="">— اختر —</option>
            {snap.ingredients.map((i) => (
              <option key={i.key} value={i.key}>{i.name}</option>
            ))}
          </select>
        </Field>

        <Field label="وضع التخزين">
          <div className="flex gap-2">
            {(["CHILLED", "FROZEN", "AMBIENT"] as StorageMode[]).map((m) => (
              <Pill key={m} active={mode === m} onClick={() => setMode(m)}>{STORAGE_LABEL[m]}</Pill>
            ))}
          </div>
        </Field>

        <Field label="المورد"><TextIn value={supplier} onChange={setSupplier} /></Field>
        <Field label="لوط المورد"><TextIn value={lot} onChange={setLot} /></Field>

        <Field label="تاريخ الصلاحية">
          <input
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="num rounded-lg border px-2 py-2 text-sm w-full"
            style={{ borderColor: T.border, background: "#FFFDF5", color: T.ink }}
          />
        </Field>

        <Field label="الكمية المستلمة (غرام)">
          <NumInput value={qty} onCommit={setQty} min={0} step={100} width={140} ariaLabel="الكمية المستلمة" />
        </Field>

        <Field label="وزن ميزاننا (غرام) — اختياري">
          <NumInput value={scale} onCommit={setScale} min={0} step={100} width={140} ariaLabel="وزن ميزاننا" />
        </Field>

        <Field label={needsTemp ? "حرارة الاستلام (°م) — مطلوبة" : "حرارة الاستلام (°م)"}>
          <span className="flex items-center gap-2">
            <Thermometer size={14} style={{ color: needsTemp && temp === null ? T.warn : T.inkSoft }} />
            <NumInput value={temp} onCommit={setTemp} min={-40} step={0.5} width={100} ariaLabel="حرارة الاستلام" />
          </span>
        </Field>

        <Field label="فحوص الاستلام">
          <div className="flex gap-4 flex-wrap text-sm">
            <Check label="التغليف سليم" value={pkg} onChange={setPkg} />
            <Check label="إقرار المورد بمسببات الحساسية" value={allergen} onChange={setAllergen} />
          </div>
        </Field>
      </div>

      <div className="px-4 pb-4 flex items-center gap-3 flex-wrap">
        <button
          onClick={submit}
          disabled={pending}
          className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          style={{ background: T.brand }}
        >
          {pending ? "جارٍ الحفظ…" : "سجّل الشحنة"}
        </button>
        <span className="text-[11px]" style={{ color: T.inkSoft }}>
          الحكم مقبول أو محجوز تحسبه القاعدة من حدود الجودة — ما يُكتب هنا.
        </span>
      </div>

      {msg && (
        <div className="px-4 pb-4">
          {msg.ok ? <OkNote text={msg.text} /> : <ErrorNote text={msg.text} />}
        </div>
      )}
    </Card>
  );
}

// ============================================================ الصرف والهدر

function IssueTab({ snap }: { snap: InventorySnapshot }) {
  const [key, setKey] = useState("");
  const [qty, setQty] = useState<number | null>(null);
  const [batch, setBatch] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const [wLot, setWLot] = useState<number | null>(null);
  const [wQty, setWQty] = useState<number | null>(null);
  const [wReason, setWReason] = useState<WasteReason>("EXPIRED");
  const [wNote, setWNote] = useState("");
  const [wMsg, setWMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [wPending, wStart] = useTransition();

  const available = snap.stock.filter((r) => r.usableG > 0);
  const issuableLots = snap.lots.filter((l) => l.balanceG > 0);

  function issue() {
    setMsg(null);
    start(async () => {
      const r = await actions.issueToProduction({ ingredientKey: key, qtyG: qty ?? 0, batchNo: batch, note: "" });
      setMsg(r.ok
        ? { ok: true, text: `تم الصرف من ${r.lots} لوط بترتيب الأقرب انتهاءً.` }
        : { ok: false, text: r.error ?? "تعذّر الصرف" });
      if (r.ok) setQty(null);
    });
  }

  function waste() {
    setWMsg(null);
    wStart(async () => {
      const r = await actions.raiseWaste({ lotId: wLot ?? 0, qtyG: wQty ?? 0, reason: wReason, note: wNote });
      if (!r.ok) { setWMsg({ ok: false, text: r.error ?? "تعذّر التسجيل" }); return; }
      setWMsg(r.status === "PENDING"
        ? { ok: false, text: `قيمته ${sar(r.value ?? 0)} فوق حدّ ${sar(snap.wasteLimitSar)} — ينتظر اعتماد المالك، والرصيد ما نقص بعد.` }
        : { ok: true, text: `سُجّل الهدر واعتُمد تلقائياً (${sar(r.value ?? 0)}).` });
      if (r.ok) { setWQty(null); setWNote(""); }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardTitle icon={<ArrowDownToLine size={16} />}>صرف للإنتاج</CardTitle>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="المكوّن">
            <select
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="rounded-lg border px-2 py-2 text-sm w-full"
              style={{ borderColor: T.border, background: "#FFFDF5", color: T.ink }}
            >
              <option value="">— اختر —</option>
              {available.map((r) => (
                <option key={r.key} value={r.key}>{r.name} — متاح {num(r.usableG)} غ</option>
              ))}
            </select>
          </Field>
          <Field label="الكمية (غرام)">
            <NumInput value={qty} onCommit={setQty} min={0} step={100} width={140} ariaLabel="كمية الصرف" />
          </Field>
          <Field label="رقم دفعة الإنتاج"><TextIn value={batch} onChange={setBatch} /></Field>
        </div>
        <div className="px-4 pb-4 flex items-center gap-3 flex-wrap">
          <button
            onClick={issue}
            disabled={pending}
            className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: T.brand }}
          >
            {pending ? "جارٍ الصرف…" : "اصرف"}
          </button>
          <span className="text-[11px]" style={{ color: T.inkSoft }}>
            التوزيع على اللوطات بالأقرب انتهاءً — القاعدة تختار، ما تُختار باليد.
          </span>
        </div>
        {msg && <div className="px-4 pb-4">{msg.ok ? <OkNote text={msg.text} /> : <ErrorNote text={msg.text} />}</div>}
      </Card>

      <Card>
        <CardTitle icon={<Trash2 size={16} />} aside={
          <span className="text-[11px]" style={{ color: T.inkSoft }}>
            فوق {sar(snap.wasteLimitSar)} يحتاج اعتماد المالك
          </span>
        }>
          تسجيل هدر
        </CardTitle>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="اللوط">
            <select
              value={wLot ?? ""}
              onChange={(e) => setWLot(e.target.value ? Number(e.target.value) : null)}
              className="rounded-lg border px-2 py-2 text-sm w-full"
              style={{ borderColor: T.border, background: "#FFFDF5", color: T.ink }}
            >
              <option value="">— اختر —</option>
              {issuableLots.map((l) => (
                <option key={l.id} value={l.id}>
                  #{l.id} · {l.ingredientName} · {num(l.balanceG)} غ · ينتهي {l.expiryDate}
                </option>
              ))}
            </select>
          </Field>
          <Field label="الكمية (غرام)">
            <NumInput value={wQty} onCommit={setWQty} min={0} step={100} width={140} ariaLabel="كمية الهدر" />
          </Field>
          <Field label="السبب">
            <select
              value={wReason}
              onChange={(e) => setWReason(e.target.value as WasteReason)}
              className="rounded-lg border px-2 py-2 text-sm w-full"
              style={{ borderColor: T.border, background: "#FFFDF5", color: T.ink }}
            >
              {(Object.keys(WASTE_REASON_LABEL) as WasteReason[]).map((k) => (
                <option key={k} value={k}>{WASTE_REASON_LABEL[k]}</option>
              ))}
            </select>
          </Field>
          <Field label="ملاحظة"><TextIn value={wNote} onChange={setWNote} /></Field>
        </div>
        <div className="px-4 pb-4">
          <button
            onClick={waste}
            disabled={wPending || !wLot}
            className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: T.warn }}
          >
            {wPending ? "جارٍ التسجيل…" : "سجّل الهدر"}
          </button>
        </div>
        {wMsg && <div className="px-4 pb-4">{wMsg.ok ? <OkNote text={wMsg.text} /> : <ErrorNote text={wMsg.text} />}</div>}
      </Card>
    </div>
  );
}

// ============================================================ قرارات المالك

function DecideTab({
  snap, held, pending,
}: {
  snap: InventorySnapshot;
  held: LotRow[];
  pending: InventorySnapshot["waste"];
}) {
  const [note, setNote] = useState("");
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const lotById = useMemo(() => new Map(snap.lots.map((l) => [l.id, l])), [snap.lots]);

  function decideLot(lotId: number, accept: boolean) {
    setMsg(null);
    start(async () => {
      const r = await actions.decideLot({ lotId, accept, note });
      setMsg(r.ok ? { ok: true, text: accept ? "فُكّ الحجز ودخلت الكمية المخزون." : "رُفضت الشحنة." }
                  : { ok: false, text: r.error ?? "تعذّر الحفظ" });
      if (r.ok) setNote("");
    });
  }

  function decideWaste(id: number, approve: boolean) {
    setMsg(null);
    start(async () => {
      const r = await actions.decideWaste({ id, approve, note });
      setMsg(r.ok ? { ok: true, text: approve ? "اعتُمد الهدر ونزل من الرصيد." : "رُفض الهدر والرصيد كما هو." }
                  : { ok: false, text: r.error ?? "تعذّر الحفظ" });
      if (r.ok) setNote("");
    });
  }

  if (held.length === 0 && pending.length === 0) {
    return (
      <Card>
        <div className="p-8 text-center">
          <ShieldCheck size={28} className="mx-auto mb-3" style={{ color: T.good }} />
          <div className="text-sm font-bold mb-1">ما فيه شي ينتظر قرارك</div>
          <div className="text-xs" style={{ color: T.inkSoft }}>
            الشحنات المحجوزة والهدر فوق {sar(snap.wasteLimitSar)} يظهران هنا.
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="p-4">
          <label className="text-[11px] font-bold block mb-1.5" style={{ color: T.inkSoft }}>
            ملاحظة القرار — تُحفظ مع كل قرار تضغطه
          </label>
          <TextIn value={note} onChange={setNote} />
        </div>
        {msg && <div className="px-4 pb-4">{msg.ok ? <OkNote text={msg.text} /> : <ErrorNote text={msg.text} />}</div>}
      </Card>

      {held.length > 0 && (
        <Card>
          <CardTitle icon={<AlertTriangle size={16} />}>شحنات محجوزة ({held.length})</CardTitle>
          <div className="p-4 flex flex-col gap-3">
            {held.map((l) => (
              <div key={l.id} className="rounded-xl p-3" style={{ background: T.warnTint, border: `1px solid ${T.border}` }}>
                <div className="flex items-center gap-2 flex-wrap text-sm font-bold mb-1">
                  <span className="num">#{l.id}</span>
                  <span>{l.ingredientName}</span>
                  <span className="num" style={{ color: T.inkSoft }}>{num(l.receivedQtyG)} غ</span>
                  <span style={{ color: T.inkSoft }}>{STORAGE_LABEL[l.storageMode]}</span>
                  {l.receiptTempC !== null && <span className="num" style={{ color: T.inkSoft }}>{l.receiptTempC}°م</span>}
                </div>
                <div className="text-xs mb-3" style={{ color: T.warn }}>{l.verdictReason}</div>
                <div className="text-[11px] mb-3" style={{ color: T.inkSoft }}>
                  استلمها {l.receivedByName || "—"} · ينتهي {l.expiryDate}
                  {l.supplier ? ` · ${l.supplier}` : ""}
                </div>
                <div className="flex gap-2">
                  <DecideBtn ok onClick={() => decideLot(l.id, true)} disabled={busy} label="اقبلها" />
                  <DecideBtn onClick={() => decideLot(l.id, false)} disabled={busy} label="ارفضها" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {pending.length > 0 && (
        <Card>
          <CardTitle icon={<Trash2 size={16} />}>هدر ينتظر اعتمادك ({pending.length})</CardTitle>
          <div className="p-4 flex flex-col gap-3">
            {pending.map((w) => {
              const l = lotById.get(w.lotId);
              return (
                <div key={w.id} className="rounded-xl p-3" style={{ background: T.warnTint, border: `1px solid ${T.border}` }}>
                  <div className="flex items-center gap-2 flex-wrap text-sm font-bold mb-1">
                    <span>{l?.ingredientName ?? `لوط #${w.lotId}`}</span>
                    <span className="num">{num(w.qtyG)} غ</span>
                    <span className="num" style={{ color: T.warn }}>{sar(w.valueSar)}</span>
                    <span className="text-[11px] font-normal" style={{ color: T.inkSoft }}>
                      الحدّ {sar(w.limitSar)}
                    </span>
                  </div>
                  <div className="text-xs mb-1">{WASTE_REASON_LABEL[w.reason]}{w.note ? ` — ${w.note}` : ""}</div>
                  <div className="text-[11px] mb-3" style={{ color: T.inkSoft }}>
                    رفعه {w.raisedByName || "—"} · الرصيد ما نقص بعد
                  </div>
                  <div className="flex gap-2">
                    <DecideBtn ok onClick={() => decideWaste(w.id, true)} disabled={busy} label="اعتمد الإعدام" />
                    <DecideBtn onClick={() => decideWaste(w.id, false)} disabled={busy} label="ارفض" />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================ عناصر صغيرة

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-bold block mb-1.5" style={{ color: T.inkSoft }}>{label}</label>
      {children}
    </div>
  );
}

function TextIn({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border px-2 py-2 text-sm w-full"
      style={{ borderColor: T.border, background: "#FFFDF5", color: T.ink }}
    />
  );
}

function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4" />
      <span className="text-xs font-bold">{label}</span>
    </label>
  );
}

function DecideBtn({ ok, label, onClick, disabled }: { ok?: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60 flex items-center gap-1.5"
      style={{ background: ok ? T.good : T.warn }}
    >
      {ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
      {label}
    </button>
  );
}

function OkNote({ text }: { text: string }) {
  return (
    <div className="rounded-lg px-3 py-2 text-xs font-bold flex items-center gap-2"
         style={{ background: T.goodTint, color: T.good }}>
      <CheckCircle2 size={14} /> {text}
    </div>
  );
}
