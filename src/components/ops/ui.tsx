"use client";

// مكوّنات واجهة مشتركة لصفحات عمليات المطبخ — بنفس هوية Macro Meals الحالية.

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
import { ChevronRight, Lock, Pencil, Printer } from "lucide-react";
import { T } from "@/lib/kitchen-shared";
import { GateStatus, SkuStatus, STATUS_LABEL } from "@/lib/ops/engine";
import { ROLES, can } from "@/lib/ops/roles";
import { useSession } from "@/lib/ops/session";
import { OPS_STAGES, modulesForRole } from "@/lib/ops/modules";

export { T };

// ---------------- تنسيق الأرقام ----------------

export function num(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function sar(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${num(v, digits)} ر.س`;
}
export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${num(v * 100, digits)}%`;
}

// وقت الرياض ثابتاً على الخادم والمتصفّح: لو تُرك للمنطقة المحلية اختلف ما
// يُرسم أول مرة عمّا يُرسم بعد الترطيب، وقرأ من في المطبخ ساعة غرينتش.
const STAMP_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Riyadh",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});
export function stamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p: Record<string, string> = {};
  for (const x of STAMP_FMT.formatToParts(d)) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day} · ${p.hour}:${p.minute}`;
}

export function OpsShell({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const session = useSession();
  const pathname = usePathname();
  const role = session?.role ?? null;
  // اللي يخصّ الدور، ومن ضمنه اللي تسمح به صلاحيته — الشرطان معاً.
  const modules = modulesForRole(role).filter((m) => can(role, m.view));
  // مرتّبة بمراحل التشغيل: الإدخال ← التجربة ← الاعتماد ← التشغيل ← المخرجات
  const groups = OPS_STAGES
    .map((s) => ({ key: s.key, label: s.label, items: modules.filter((m) => m.stage === s.key) }))
    .filter((g) => g.items.length > 0);
  return (
    <div style={{ background: T.bg, color: T.ink }} className="min-h-screen w-full">
      <div className="w-full border-b print:hidden" style={{ borderColor: T.border, background: T.surface }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Image src="/brand/logo-symbol.png" alt="Macro Meals" width={40} height={40} className="rounded-xl" />
            <div>
              <div className="font-bold text-lg leading-none" style={{ color: T.brand }}>{title}</div>
              {subtitle && <div className="text-xs mt-1.5" style={{ color: T.inkSoft }}>{subtitle}</div>}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {actions}
            {session && (
              <span className="text-[11px] font-bold rounded-full px-3 py-1.5" style={{ background: T.brandTint, color: T.brand }}>
                {ROLES[session.role].label}
                {session.name ? ` · ${session.name}` : ""}
              </span>
            )}
            <Link href="/admin" className="flex items-center gap-1 text-xs font-bold" style={{ color: T.inkSoft }}>
              تبديل الدور
              <ChevronRight size={13} />
            </Link>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-3 flex items-center gap-3 overflow-x-auto">
          <NavChip href="/admin/ops" label="مركز العمليات" active={pathname === "/admin/ops"} locked={false} />
          {groups.map((g) => (
            <div key={g.key} className="flex items-center gap-2 shrink-0">
              <span
                className="shrink-0 text-[10px] font-bold whitespace-nowrap pr-1"
                style={{ color: T.inkSoft, borderRight: `1px solid ${T.border}`, paddingRight: 10 }}
              >
                {g.label}
              </span>
              {g.items.map((m) => (
                <NavChip
                  key={m.href}
                  href={m.href}
                  label={m.label}
                  active={pathname === m.href}
                  locked={!(m.edit && can(role, m.edit))}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</div>
    </div>
  );
}

/**
 * قطعة في الشريط. `locked` تعني «تنفتح للقراءة، ما تنفتح للتعديل» — وهذا
 * اللي يحتاج يبيّن قبل الضغط لا بعده: الموظف يعرف من الشريط إيش يخصّه.
 */
function NavChip({ href, label, active, locked }: { href: string; label: string; active: boolean; locked: boolean }) {
  const style = active
    ? { background: T.brand, color: "#fff" }
    : locked
      ? { background: "#F3EFEC", color: T.inkSoft, border: `1px solid ${T.border}` }
      : { background: T.brandTint, color: T.brand };
  return (
    <Link
      href={href}
      title={locked ? LOCKED_FIELD_TITLE : undefined}
      className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap inline-flex items-center gap-1"
      style={style}
    >
      {locked && <Lock size={10} style={{ opacity: active ? 0.85 : 0.7 }} />}
      {label}
    </Link>
  );
}

// ---------------- عناصر عامة ----------------

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-4 sm:p-5 ${className}`} style={{ background: T.surface, border: `1px solid ${T.border}` }}>
      {children}
    </div>
  );
}

export function CardTitle({ icon, children, aside }: { icon?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
      <div className="flex items-center gap-2">
        {icon && <span style={{ color: T.brand }} className="flex">{icon}</span>}
        <div className="font-semibold text-sm">{children}</div>
      </div>
      {aside}
    </div>
  );
}

export function Kpi({ label, value, tone }: { label: string; value: ReactNode; tone?: "good" | "warn" | "hold" }) {
  const color = tone === "good" ? T.good : tone === "warn" ? PENDING_COLOR : tone === "hold" ? T.warn : T.brand;
  return (
    <div className="rounded-2xl p-4" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
      <div className="text-[11px] mb-1.5" style={{ color: T.inkSoft }}>{label}</div>
      <div className="text-2xl font-extrabold leading-none" style={{ color }}>{value}</div>
    </div>
  );
}

export const PENDING_COLOR = "#A05D0E";
export const PENDING_TINT = "#FBF1DC";

export function statusColors(status: SkuStatus | GateStatus) {
  if (status === "READY") return { fg: T.good, bg: T.goodTint };
  if (status === "HOLD") return { fg: T.warn, bg: T.warnTint };
  return { fg: PENDING_COLOR, bg: PENDING_TINT };
}

export function StatusBadge({ status, small }: { status: SkuStatus; small?: boolean }) {
  const c = statusColors(status);
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded-full whitespace-nowrap ${small ? "text-[10px] px-2 py-0.5" : "text-[11px] px-2.5 py-1"}`}
      style={{ background: c.bg, color: c.fg }}
    >
      <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: c.fg }} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export const GATE_LABEL: Record<GateStatus, string> = { READY: "معتمد", PENDING: "بانتظار", HOLD: "موقوف" };

// شريط يوضح للمستخدم هل يقدر يعدّل أو يشوف فقط
export function AccessNote({ canEdit, editText, viewText }: { canEdit: boolean; editText: string; viewText: string }) {
  return (
    <div
      className="flex items-start gap-2 rounded-xl px-4 py-3 mb-5 print:hidden"
      style={{ background: canEdit ? T.brandTint : "#F3EFEC" }}
    >
      {canEdit ? (
        <Pencil size={15} style={{ color: T.brand }} className="mt-0.5 shrink-0" />
      ) : (
        <Lock size={15} style={{ color: T.inkSoft }} className="mt-0.5 shrink-0" />
      )}
      <p className="text-[12px] leading-relaxed" style={{ color: canEdit ? T.brand : T.inkSoft }}>
        {canEdit ? editText : viewText}
      </p>
    </div>
  );
}

export function PrintButton({ label = "طباعة" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold print:hidden"
      style={{ background: T.surface, color: T.brand, border: `1px solid ${T.border}` }}
    >
      <Printer size={13} /> {label}
    </button>
  );
}

export function ErrorNote({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="text-xs font-bold rounded-lg px-3 py-2 mt-2" style={{ background: T.warnTint, color: T.warn }}>
      {text}
    </div>
  );
}

export function LockedHint({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: T.inkSoft }}>
      <Lock size={11} /> {text}
    </span>
  );
}

// حقل رقمي يحفظ عند الخروج منه أو Enter (ما يحفظ مع كل ضغطة)
export function NumInput({
  value,
  onCommit,
  disabled,
  min = 0,
  step = 1,
  width = 76,
  placeholder,
  ariaLabel,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  disabled?: boolean;
  min?: number;
  step?: number;
  width?: number;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const shown = value === null || value === undefined ? "" : String(value);
  const [draft, setDraft] = useState(shown);
  const [lastShown, setLastShown] = useState(shown);
  if (lastShown !== shown) {
    // القيمة تغيّرت من برّا (حفظ أو تبويب ثاني) — نحدّث المسودة
    setLastShown(shown);
    setDraft(shown);
  }
  function commit() {
    if (draft === shown) return;
    if (draft.trim() === "") {
      onCommit(null);
      return;
    }
    const v = Number(draft);
    if (Number.isNaN(v) || v < min) {
      setDraft(shown);
      return;
    }
    onCommit(v);
  }
  const input = (
    <input
      type="number"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={draft}
      min={min}
      step={step}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="rounded-lg border px-2 py-1.5 text-sm text-center font-bold disabled:opacity-60 disabled:cursor-not-allowed"
      style={{ borderColor: T.border, width, background: disabled ? T.bg : "#FFFDF5", color: T.ink }}
    />
  );
  if (!disabled) return input;
  // الحقل الرمادي وحده يُقرأ «فاضي» أو «تعطّل». القفل يقول السبب: مو دورك.
  return (
    <span className="relative inline-flex items-center align-middle" title={LOCKED_FIELD_TITLE}>
      {input}
      <Lock size={10} className="absolute left-1.5 pointer-events-none" style={{ color: T.inkSoft }} />
    </span>
  );
}

/** نص واحد يشرح أي حقل أو زر مقفول — عشان ما يختلف من شاشة لشاشة. */
export const LOCKED_FIELD_TITLE = "عرض فقط — هذا من صلاحية قسم ثاني";

/**
 * محاذاة العمود. تُمرَّر بـ`align` لا بكلاس في className، لأن ترتيب كلاسات
 * Tailwind في الملف هو الحاكم لا ترتيبها في السطر: `text-right` كان مكتوباً
 * في أساس الرأس فيغلب `text-center` الممرَّر، فيقف الرأس يميناً وأرقامه في
 * الوسط — وهذا اللي كان يخرّب الجداول.
 *
 * و«num» يعني عمود أرقام: الرأس وخلاياه على الحافة نفسها، والأرقام بعرض
 * ثابت (tnum)، فتقف خانة الآحاد تحت خانة الآحاد مهما اختلفت الأطوال.
 * ووحدة القياس تُكتب في الرأس لا في كل خليّة — «المتاح (غ)» لا «24,000 غ» —
 * حتى يبقى عمود الأرقام أرقاماً خالصة.
 */
export type Align = "start" | "center" | "num";
const TH_ALIGN: Record<Align, string> = { start: "text-right", center: "text-center", num: "text-right" };
const TD_ALIGN: Record<Align, string> = { start: "text-right", center: "text-center", num: "text-right num" };

export function Th({ children, className = "", align = "start" }: { children?: ReactNode; className?: string; align?: Align }) {
  return (
    <th className={`${TH_ALIGN[align]} text-[11px] font-bold px-2.5 py-2 whitespace-nowrap ${className}`} style={{ color: T.inkSoft }}>
      {children}
    </th>
  );
}
export function Td({ children, className = "", strong, align }: { children?: ReactNode; className?: string; strong?: boolean; align?: Align }) {
  return (
    <td className={`${align ? TD_ALIGN[align] : ""} px-2.5 py-2 text-xs align-middle ${strong ? "font-bold" : ""} ${className}`}>{children}</td>
  );
}

export function TableWrap({ children, minWidth = 520 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full border-collapse" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap"
      style={
        active
          ? { background: T.brand, color: "#fff", border: `1px solid ${T.brand}` }
          : { background: T.surface, color: T.inkSoft, border: `1px solid ${T.border}` }
      }
    >
      {children}
    </button>
  );
}

export function Loading() {
  return (
    <div className="py-16 text-center text-xs" style={{ color: T.inkSoft }}>
      جاري تحميل البيانات…
    </div>
  );
}

// اختيار ثلاثي لحالة بوابة: معتمد / بانتظار / موقوف
export function TriState({
  value,
  onChange,
  disabled,
  allowHold = true,
  locked = [],
  lockedTitle,
}: {
  value: GateStatus;
  onChange: (v: GateStatus) => void;
  disabled?: boolean;
  allowHold?: boolean;
  /** خيارات تظهر لكن ما تُضغط — مقفولة بشرط، لا مخفية. الاختفاء يربك. */
  locked?: GateStatus[];
  lockedTitle?: string;
}) {
  const options: GateStatus[] = allowHold ? ["READY", "PENDING", "HOLD"] : ["READY", "PENDING"];
  if (disabled) {
    const c = statusColors(value);
    return (
      <span
        title={LOCKED_FIELD_TITLE}
        className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap"
        style={{ background: c.bg, color: c.fg }}
      >
        <Lock size={9} style={{ opacity: 0.75 }} />
        {GATE_LABEL[value]}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-lg overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
      {options.map((o) => {
        const c = statusColors(o);
        const active = o === value;
        const isLocked = locked.includes(o) && !active;
        return (
          <button
            key={o}
            onClick={() => !active && !isLocked && onChange(o)}
            disabled={isLocked}
            aria-pressed={active}
            title={isLocked ? lockedTitle : undefined}
            className="px-2.5 py-1 text-[10px] font-bold whitespace-nowrap flex items-center gap-1 disabled:cursor-not-allowed"
            style={
              active
                ? { background: c.fg, color: "#fff" }
                : isLocked
                  ? { background: T.bg, color: T.inkSoft, opacity: 0.5 }
                  : { background: T.surface, color: T.inkSoft }
            }
          >
            {isLocked && <Lock size={9} />}
            {GATE_LABEL[o]}
          </button>
        );
      })}
    </span>
  );
}
