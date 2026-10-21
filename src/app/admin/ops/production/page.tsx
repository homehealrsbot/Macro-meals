"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChefHat, ShoppingCart, Eraser, AlertTriangle } from "lucide-react";
import { computeProduction, ingApprovalOfKind } from "@/lib/ops/engine";
import { can } from "@/lib/ops/roles";
import { useSession } from "@/lib/ops/session";
import { useOps } from "@/lib/ops/store";
import { useStage } from "@/lib/ops/stage";
import {
  AccessNote,
  Card,
  CardTitle,
  ErrorNote,
  GATE_LABEL,
  Kpi,
  Loading,
  NumInput,
  OpsShell,
  Pill,
  PrintButton,
  StatusBadge,
  T,
  TableWrap,
  Td,
  Th,
  num,
  pct,
  sar,
  statusColors,
} from "@/components/ops/ui";

const MEAL_GROUPS = ["فطور", "غداء", "عشاء", "سناك", "شوربة", "سلطة", "حلا"];

// نرتّب صفوف اليوم حسب مجموعة الوجبة، وأي خانة ما تطابق أي مجموعة تنزل في النهاية
// بدل ما تختفي من الجدول بالكامل (كان يصير كذا لو أضيفت خانة بمسمى جديد في rotation.json).
function groupOf(slotLabel: string): string {
  const i = MEAL_GROUPS.findIndex((g) => slotLabel.startsWith(g));
  return i < 0 ? "أخرى" : MEAL_GROUPS[i];
}

function groupRank(slotLabel: string): number {
  const i = MEAL_GROUPS.findIndex((g) => slotLabel.startsWith(g));
  return i < 0 ? MEAL_GROUPS.length : i;
}

function groupRows<R extends { slotLabel: string }>(rows: R[]): R[] {
  return rows
    .map((row, order) => ({ row, order }))
    .sort((a, b) => groupRank(a.row.slotLabel) - groupRank(b.row.slotLabel) || a.order - b.order)
    .map(({ row }) => row);
}

export default function ProductionPage() {
  const ops = useOps();
  const stage = useStage();
  // اعتماد السعر الموثّق: نسأله بنوعه من التعريفات لا برقمه
  const priceApproval = ingApprovalOfKind(ops.data.ingApprovalDefs, "price");
  const session = useSession();
  const role = session?.role ?? null;
  const canEdit = can(role, "production.edit");
  const showFinance = can(role, "finance.view");
  const showShopping = can(role, "shopping.view");
  const [day, setDay] = useState(0);
  const [error, setError] = useState("");

  const plan = useMemo(
    () => computeProduction(ops.data, ops.computed, day, ops.state.production[day] ?? {}),
    [ops.data, ops.computed, ops.state.production, day],
  );

  if (!ops.ready) {
    return (
      <OpsShell title="خطة الإنتاج والمشتريات">
        <Loading />
      </OpsShell>
    );
  }

  const dayLabel = ops.data.rotation.days[day]?.label ?? "";
  const nonReadyPlanned = plan.rows.filter((r) => r.portions > 0 && ops.skuMap.get(r.skuId)?.quality.status === "PENDING").length;
  const holdPlanned = plan.rows.filter((r) => r.portions > 0 && ops.skuMap.get(r.skuId)?.quality.status === "HOLD");

  return (
    <OpsShell
      title="خطة الإنتاج والمشتريات"
      subtitle="اختر يوم الدوران، أدخل عدد الحصص، وتطلع قائمة المشتريات تلقائياً"
      actions={<PrintButton />}
    >
      <AccessNote
        canEdit={canEdit}
        editText="أدخل عدد الحصص لكل صنف. الصنف «المتوقف» ما يقبل حصص، و«بانتظار الاعتماد» للتجربة الداخلية فقط."
        viewText="عرض فقط — إدخال الحصص من صلاحية المطبخ."
      />

      {/* اختيار اليوم */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-5 print:hidden">
        {ops.data.rotation.days.map((d, i) => {
          const planned = Object.values(ops.state.production[i] ?? {}).reduce((a, v) => a + (Number(v) || 0), 0);
          return (
            <Pill key={d.label} active={i === day} onClick={() => { setDay(i); setError(""); }}>
              {d.label}
              {planned > 0 ? ` (${planned})` : ""}
            </Pill>
          );
        })}
      </div>

      <div className="hidden print:block text-base font-bold mb-3">خطة الإنتاج — يوم {dayLabel}</div>

      <div className={`grid grid-cols-2 ${showFinance ? "md:grid-cols-4" : "md:grid-cols-2"} gap-3 mb-6`}>
        <Kpi label={`إجمالي الحصص — ${dayLabel}`} value={num(plan.totals.portions)} />
        <Kpi label="أصناف مخططة" value={plan.rows.filter((r) => r.portions > 0).length} />
        {showFinance && <Kpi label="إيراد صافٍ (بدون ضريبة)" value={sar(plan.totals.revenue, 0)} />}
        {showFinance && <Kpi label="هامش المساهمة" value={pct(plan.totals.marginPct)} tone="good" />}
      </div>

      {nonReadyPlanned > 0 && (
        <div className="flex items-start gap-2 rounded-xl px-4 py-3 mb-5" style={{ background: "#FBF1DC", color: T.accentText }}>
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <p className="text-[12px] leading-relaxed">
            {nonReadyPlanned} صنف في الخطة غير معتمد للبيع بعد — إنتاجه للتجربة الداخلية فقط لحد ما تكمل بوابات الجودة.
          </p>
        </div>
      )}

      {holdPlanned.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl px-4 py-3 mb-5" style={{ background: T.warnTint, color: T.warn }}>
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <p className="text-[12px] leading-relaxed font-bold">
            فيه حصص مخططة لأصناف صارت متوقفة: {holdPlanned.map((r) => r.sku?.item.name ?? r.skuId).join("، ")} — صفّر حصصها.
          </p>
        </div>
      )}

      <Card className="mb-6">
        <CardTitle
          icon={<ChefHat size={17} />}
          aside={
            canEdit && plan.totals.portions > 0 ? (
              <button
                onClick={async () => {
                  const r = await stage.clearDay(day);
                  setError(r.ok ? "" : r.error);
                }}
                className="flex items-center gap-1 text-[11px] font-bold print:hidden"
                style={{ color: T.inkSoft }}
              >
                <Eraser size={12} /> تصفير حصص اليوم
              </button>
            ) : null
          }
        >
          أصناف اليوم ({plan.rows.length})
        </CardTitle>
        <ErrorNote text={error} />
        <TableWrap minWidth={showFinance ? 760 : 0}>
          <thead>
            <tr>
              <Th>الصنف</Th>
              <Th align="center">حصص مخططة</Th>
              {showFinance && <Th>السعر</Th>}
              {showFinance && <Th>إيراد صافٍ</Th>}
              {showFinance && <Th>تكلفة/حصة</Th>}
              {showFinance && <Th>تكلفة إجمالية</Th>}
              {showFinance && <Th>هامش</Th>}
              <Th className="print:hidden" />
            </tr>
          </thead>
          <tbody>
            {groupRows(plan.rows).map((r, idx, all) => {
              // أول صف في كل مجموعة ياخذ خط فاصل بلون الهوية
              const isGroupStart = idx === 0 || groupOf(all[idx - 1].slotLabel) !== groupOf(r.slotLabel);
              const view = ops.skuMap.get(r.skuId);
              const status = view?.quality.status ?? "PENDING";
              const isHold = status === "HOLD";
              return (
                <tr key={r.slot} className="border-t" style={{ borderColor: isGroupStart ? T.brandBright : T.border }}>
                  <Td>
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-[10px] font-bold" style={{ color: T.brand }}>{r.slotLabel}</span>
                      <StatusBadge status={status} small />
                    </div>
                    <div className="font-bold text-[13px]">{r.sku?.item.name ?? r.skuId}</div>
                    <div className="text-[10px]" style={{ color: T.inkSoft }}>
                      {r.skuId}
                      {r.sku && r.sku.allergens !== "لا يوجد" ? ` · حساسية: ${r.sku.allergens}` : ""}
                    </div>
                  </Td>
                  <Td className="text-center">
                    {canEdit ? (
                      <NumInput
                        ariaLabel={`حصص ${r.sku?.item.name ?? r.skuId}`}
                        value={r.portions || null}
                        disabled={isHold && r.portions === 0}
                        placeholder={isHold ? "موقوف" : "0"}
                        onCommit={async (v) => {
                          const res = await stage.setPortions(day, r.slot, v ?? 0, r.skuId);
                          setError(res.ok ? "" : res.error);
                        }}
                      />
                    ) : (
                      <span className="font-bold text-sm">{r.portions || "—"}</span>
                    )}
                  </Td>
                  {showFinance && <Td>{sar(r.sku?.price, 0)}</Td>}
                  {showFinance && <Td>{r.portions ? sar(r.revenue) : "—"}</Td>}
                  {showFinance && <Td>{sar(r.sku?.fullCost)}</Td>}
                  {showFinance && <Td>{r.portions ? sar(r.totalFullCost) : "—"}</Td>}
                  {showFinance && <Td strong>{r.portions ? sar(r.margin) : "—"}</Td>}
                  <Td className="print:hidden">
                    <Link
                      href={`/admin/ops/kitchen-card?sku=${r.skuId}${r.portions ? `&batch=${r.portions}` : ""}`}
                      className="text-[11px] font-bold whitespace-nowrap"
                      style={{ color: T.brand }}
                    >
                      بطاقة المطبخ ←
                    </Link>
                  </Td>
                </tr>
              );
            })}
          </tbody>
          {showFinance && plan.totals.portions > 0 && (
            <tfoot>
              <tr className="border-t-2" style={{ borderColor: T.brand }}>
                <Td strong>الإجمالي</Td>
                <Td className="text-center" strong>{num(plan.totals.portions)}</Td>
                <Td />
                <Td strong>{sar(plan.totals.revenue)}</Td>
                <Td />
                <Td strong>{sar(plan.totals.cost)}</Td>
                <Td strong>{sar(plan.totals.revenue - plan.totals.cost)}</Td>
                <Td className="print:hidden" />
              </tr>
            </tfoot>
          )}
        </TableWrap>
      </Card>

      {/* قائمة المشتريات */}
      {showShopping && (
        <Card>
          <CardTitle
            icon={<ShoppingCart size={17} />}
            aside={showFinance && plan.shopping.length > 0 ? <span className="text-xs font-bold" style={{ color: T.brand }}>الإجمالي: {sar(plan.shoppingCost)}</span> : null}
          >
            قائمة المشتريات — {dayLabel} ({plan.shopping.length} مكوّن)
          </CardTitle>
          <div className="text-[11px] mb-3" style={{ color: T.inkSoft }}>
            الكميات شاملة هدر التحضير ({pct(ops.data.settings.wastePct, 0)}) ومحسوبة على الوصفة الأساسية (Balanced).
          </div>
          {plan.shopping.length === 0 ? (
            <div className="text-xs py-8 text-center" style={{ color: T.inkSoft }}>
              أدخل عدد الحصص فوق وتظهر المكوّنات المطلوبة هنا
            </div>
          ) : (
            <TableWrap minWidth={showFinance ? 520 : 0}>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>المكوّن</Th>
                  <Th>كمية الشراء (كجم)</Th>
                  {showFinance && <Th>سعر/كجم</Th>}
                  {showFinance && <Th>التكلفة</Th>}
                  {showFinance && <Th>حالة السعر</Th>}
                </tr>
              </thead>
              <tbody>
                {plan.shopping.map((s, i) => {
                  const priceStatus = priceApproval ? ops.ingApprovals(s.key)[priceApproval.index] : "PENDING";
                  const c = statusColors(priceStatus);
                  return (
                    <tr key={s.key} className="border-t" style={{ borderColor: T.border }}>
                      <Td>{i + 1}</Td>
                      <Td strong>{s.name}</Td>
                      <Td strong>{num(s.buyKg, 3)}</Td>
                      {showFinance && <Td>{sar(s.price)}</Td>}
                      {showFinance && <Td>{sar(s.cost)}</Td>}
                      {showFinance && (
                        <Td>
                          <span className="text-[10px] font-bold rounded-full px-2 py-0.5" style={{ background: c.bg, color: c.fg }}>
                            {GATE_LABEL[priceStatus]}
                          </span>
                        </Td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
        </Card>
      )}
    </OpsShell>
  );
}
