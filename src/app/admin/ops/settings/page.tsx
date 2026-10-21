"use client";

import Link from "next/link";
import { useState } from "react";
import { Save, Undo2, SlidersHorizontal } from "lucide-react";
import { ING_TYPE_LABEL, IngType, LEVELS, SECTIONS, Settings } from "@/lib/ops/engine";
import { BASE_DATA, useOps } from "@/lib/ops/store";
import { AccessNote, Card, CardTitle, ErrorNote, Loading, OpsShell, T, TableWrap, Td, Th } from "@/components/ops/ui";
import { useStage } from "@/lib/ops/stage";

const TYPES: IngType[] = ["P", "C", "V", "S"];

export default function SettingsPage() {
  const ops = useOps();
  const stage = useStage();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  if (!ops.ready) {
    return (
      <OpsShell title="الإعدادات">
        <Loading />
      </OpsShell>
    );
  }

  const s = draft ?? ops.data.settings;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(ops.data.settings);
  const isDefault = JSON.stringify(ops.data.settings) === JSON.stringify(BASE_DATA.settings);
  const patch = (p: Partial<Settings>) => { setSaved(""); setDraft({ ...s, ...p }); };

  async function save() {
    if (!draft) return;
    for (const sec of SECTIONS) {
      const x = draft.sections[sec];
      if (!(x.targetCostPct > 0 && x.targetCostPct <= 1)) {
        setError(`نسبة التكلفة المستهدفة لقسم «${sec}» لازم تكون بين 1% و 100%`);
        return;
      }
    }
    if (!(draft.priceRoundStep > 0)) {
      setError("خطوة تقريب السعر لازم تكون أكبر من صفر");
      return;
    }
    const r = await stage.saveSettings(draft);
    if (r.ok) {
      setDraft(null);
      setError("");
      setSaved("أُضيف للمسوّدة — اضغط «إرسال» تحت، والأرقام تتحدّث بعد الاعتماد");
    } else setError(r.error);
  }

  return (
    <OpsShell title="الإعدادات" subtitle="مضاعفات الحصص ونسب التكلفة — أي تعديل ينعكس على كل الأسعار والهوامش">
      <AccessNote
        canEdit
        editText="هذي افتراضات أولية من ملف العمليات. استبدلها بعروض موردي التغليف، جدول رواتب المطبخ، وعقود بوابة الدفع والتطبيقات."
        viewText=""
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardTitle icon={<SlidersHorizontal size={17} />}>مضاعفات الحصص حسب المستوى</CardTitle>
          <TableWrap>
            <thead>
              <tr>
                <Th>المكوّن</Th>
                {LEVELS.map((l) => <Th key={l.key} align="center">{l.label}</Th>)}
              </tr>
            </thead>
            <tbody>
              {TYPES.map((t) => (
                <tr key={t} className="border-t" style={{ borderColor: T.border }}>
                  <Td strong>{ING_TYPE_LABEL[t]}</Td>
                  {LEVELS.map((l) => (
                    <Td key={l.key} className="text-center">
                      {l.key === "balanced" ? (
                        <span className="font-bold" style={{ color: T.inkSoft }}>1</span>
                      ) : (
                        <Field
                          label={`${ING_TYPE_LABEL[t]} ${l.label}`}
                          value={s.multipliers[t][l.key]}
                          step={0.05}
                          onChange={(v) => patch({ multipliers: { ...s.multipliers, [t]: { ...s.multipliers[t], [l.key]: v } } })}
                        />
                      )}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <div className="text-[10px] mt-3 leading-relaxed" style={{ color: T.inkSoft }}>
            المضاعفات تُطبَّق على الأطباق الرئيسية فقط. Balanced = 1 دائماً (الوصفة الأساسية).
          </div>
        </Card>

        <Card>
          <CardTitle>التغليف، نسبة التكلفة، والعمالة لكل قسم</CardTitle>
          <TableWrap>
            <thead>
              <tr>
                <Th>القسم</Th>
                <Th align="center">تغليف/طبق (ر.س)</Th>
                <Th align="center">نسبة التكلفة المستهدفة %</Th>
                <Th align="center">عمالة/طبق (ر.س)</Th>
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((sec) => {
                const x = s.sections[sec];
                const set = (p: Partial<typeof x>) => patch({ sections: { ...s.sections, [sec]: { ...x, ...p } } });
                return (
                  <tr key={sec} className="border-t" style={{ borderColor: T.border }}>
                    <Td strong>{sec}</Td>
                    <Td className="text-center"><Field label={`تغليف ${sec}`} value={x.packaging} step={0.1} onChange={(v) => set({ packaging: v })} /></Td>
                    <Td className="text-center"><Field label={`نسبة تكلفة ${sec}`} value={x.targetCostPct} percent onChange={(v) => set({ targetCostPct: v })} /></Td>
                    <Td className="text-center"><Field label={`عمالة ${sec}`} value={x.labor} step={0.5} onChange={(v) => set({ labor: v })} /></Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
          <div className="text-[10px] mt-3 leading-relaxed" style={{ color: T.inkSoft }}>
            السعر المقترح = التكلفة الكلية ÷ نسبة التكلفة المستهدفة، ثم تقريب لأعلى.
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardTitle>التكلفة والتسعير</CardTitle>
          <div className="space-y-3">
            <Row label="هدر وفاقد تحضير" hint="على تكلفة المكوّنات وكميات الشراء"><Field label="هدر" value={s.wastePct} percent onChange={(v) => patch({ wastePct: v })} /></Row>
            <Row label="بدل بهارات ومستلزمات صغيرة/طبق (ر.س)" hint="ملح، فلفل، ماء، غاز…"><Field label="بهارات" value={s.spiceAllowance} step={0.05} onChange={(v) => patch({ spiceAllowance: v })} /></Row>
            <Row label="خطوة تقريب السعر لأعلى (ر.س)"><Field label="تقريب" value={s.priceRoundStep} step={0.5} onChange={(v) => patch({ priceRoundStep: v })} /></Row>
            <Row label="حد تحذير هامش المساهمة" hint="أي صنف أقل منه يُعلَّم أحمر"><Field label="حد الهامش" value={s.marginWarnPct} percent onChange={(v) => patch({ marginWarnPct: v })} /></Row>
          </div>
        </Card>

        <Card>
          <CardTitle>التكلفة التشغيلية الكاملة</CardTitle>
          <div className="space-y-3">
            <Row label="ضريبة القيمة المضافة" hint="تحقق من هيئة الزكاة والضريبة والجمارك قبل الاعتماد"><Field label="ضريبة" value={s.vatRate} percent onChange={(v) => patch({ vatRate: v })} /></Row>
            <Row label="السعر المقترح شامل الضريبة؟">
              <select
                aria-label="السعر شامل الضريبة"
                value={s.priceIncludesVat}
                onChange={(e) => patch({ priceIncludesVat: Number(e.target.value) })}
                className="rounded-lg border px-2 py-1.5 text-sm font-bold"
                style={{ borderColor: T.border, background: "#FFFDF5" }}
              >
                <option value={1}>نعم</option>
                <option value={0}>لا</option>
              </select>
            </Row>
            <Row label="رسوم الدفع الإلكتروني" hint="% من صافي السعر — من عقد بوابة الدفع"><Field label="رسوم الدفع" value={s.paymentFeePct} percent onChange={(v) => patch({ paymentFeePct: v })} /></Row>
            <Row label="عمولة تطبيقات التوصيل" hint="% من صافي السعر — من عقود التطبيقات"><Field label="عمولة التطبيقات" value={s.appCommissionPct} percent onChange={(v) => patch({ appCommissionPct: v })} /></Row>
            <Row label="حصة المبيعات عبر التطبيقات" hint="% من إجمالي المبيعات"><Field label="حصة التطبيقات" value={s.appSalesShare} percent onChange={(v) => patch({ appSalesShare: v })} /></Row>
          </div>
          <div className="text-[10px] mt-3 leading-relaxed" style={{ color: T.inkSoft }}>
            التكلفة الكاملة = مكوّنات + هدر + بهارات + تغليف + عمالة + رسوم الدفع والتطبيقات. لا تشمل الإيجار والكهرباء والإدارة والتسويق.
          </div>
        </Card>
      </div>

      <Card className="mb-6">
        <CardTitle>حدود الفرز والجودة</CardTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
          <Row label="حد الكارب لوسم «قليل الكارب» (جم)" hint="قاعدة فرز داخلية — ليست ادعاءً طبياً"><Field label="حد الكارب" value={s.lowCarbMax} onChange={(v) => patch({ lowCarbMax: v })} /></Row>
          <Row label="حد البروتين لوسم «بروتين عالٍ» (جم)" hint="للرئيسي والسلطة"><Field label="حد البروتين" value={s.highProteinMin} onChange={(v) => patch({ highProteinMin: v })} /></Row>
          <Row label="حد فرق السعرات المقبول عن الماكروز" hint="للتحقق من اتساق بيانات المكوّنات"><Field label="فرق السعرات" value={s.kcalDiffMax} percent onChange={(v) => patch({ kcalDiffMax: v })} /></Row>
          <Row label="حد الصلاحية اللي يحتاج اعتماد (ساعة)" hint="أي صنف صلاحيته المعلنة أعلى يتوقف تلقائياً لحد اعتماد بوابة الصلاحية"><Field label="حد الصلاحية" value={s.shelfLifeApprovalH} onChange={(v) => patch({ shelfLifeApprovalH: v })} /></Row>
          <Row label="تجارب Pilot الناجحة المطلوبة" hint="كم تجربة طبخ ناجحة تحتاجها بوابة المطبخ قبل قرار الشيف"><Field label="تجارب Pilot" value={s.pilotPassesRequired} onChange={(v) => patch({ pilotPassesRequired: v })} /></Row>
          <Row label="تساهل مطابقة الـyield" hint="كم يُسمح أن يبعد قياس المطبخ عن مرجع المالك قبل أن يُحكم عليه بالمخالفة. صفر أو غير مكتوب = ١٠٪"><Field label="تساهل الـyield" value={s.yieldTolerancePct} percent onChange={(v) => patch({ yieldTolerancePct: v })} /></Row>
        </div>
      </Card>

      <Card className="mb-6">
        <CardTitle>قرار الإطلاق</CardTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
          <Row
            label="حد الإطلاق الأدنى (عدد الأصناف الجاهزة)"
            hint="قرار تجاري: كم صنف جاهز للبيع يكفي لفتح البيع. صفر = ما انحدد، والقرار يبقى NO-GO لهذا السبب"
          >
            <Field label="حد الإطلاق" value={s.readyItemsRequired} onChange={(v) => patch({ readyItemsRequired: v })} />
          </Row>
        </div>
        <div className="text-[10px] mt-3 leading-relaxed" style={{ color: T.inkSoft }}>
          هذا الرقم وحده ما يفتح الإطلاق: لازم كل محور جاهزية مكتمل كمان. شوف{" "}
          <Link href="/admin/launch" className="underline font-bold">لوحة قرار الإطلاق</Link>.
        </div>
      </Card>

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={save} disabled={!dirty} className="flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-bold text-[#0B1410] disabled:opacity-40" style={{ background: T.brandBright }}>
          <Save size={15} /> حفظ الإعدادات
        </button>
        {dirty && (
          <button onClick={() => { setDraft(null); setError(""); }} className="flex items-center gap-1 text-xs font-bold" style={{ color: T.inkSoft }}>
            <Undo2 size={13} /> تراجع عن التغييرات
          </button>
        )}
        {!dirty && !isDefault && (
          <button onClick={() => { setSaved(""); setDraft(BASE_DATA.settings); }} className="text-xs font-bold" style={{ color: T.inkSoft }}>
            تحميل قيم الملف الأصلي
          </button>
        )}
        {saved && <span className="text-xs font-bold" style={{ color: T.good }}>{saved}</span>}
      </div>
      <ErrorNote text={error} />
    </OpsShell>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-xs font-medium">{label}</div>
        {hint && <div className="text-[10px] mt-0.5" style={{ color: T.inkSoft }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

// حقل رقمي للإعدادات — النسب تُعرض كنسبة مئوية وتُخزَّن ككسر
function Field({ label, value, onChange, percent, step }: { label: string; value: number; onChange: (v: number) => void; percent?: boolean; step?: number }) {
  const shown = percent ? Math.round(value * 10000) / 100 : value;
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        aria-label={label}
        value={Number.isNaN(shown) ? "" : shown}
        min={0}
        step={step ?? (percent ? 0.5 : 1)}
        onChange={async (e) => {
          const v = e.target.value === "" ? 0 : Number(e.target.value);
          if (Number.isNaN(v) || v < 0) return;
          onChange(percent ? v / 100 : v);
        }}
        className="rounded-lg border px-2 py-1.5 text-sm text-center font-bold"
        style={{ borderColor: T.border, width: 80, background: "#FFFDF5" }}
      />
      {percent && <span className="text-[11px]" style={{ color: T.inkSoft }}>%</span>}
    </span>
  );
}
