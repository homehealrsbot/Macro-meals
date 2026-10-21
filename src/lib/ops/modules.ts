// وحدات العمليات ومسار كل واحدة مع الصلاحية اللي تفتحها.
//
// بيانات نقية بلا React ولا "use client": صفحة /admin هي Server Component
// وتحتاج تفلتر الوحدات حسب دور الموظف قبل الإرسال، فلو كانت هذي المصفوفة
// داخل ملف عميل توصلها كمرجع عميل وينكسر .filter وقت التشغيل.
//
// كل وحدة تحمل شيئين فوق الصلاحية:
//
//   stage — موقعها في سلسلة التشغيل. الشريط يعرض الوحدات مرتّبة بالمراحل
//           لا مرصوفة بلا ترتيب، فالموظف يقرأ من الشاشة وين موقعه ووش بعده.
//
//   roles — مين يشوفها أصلاً. الصلاحية (view) تقول «يقدر»، وهذي تقول
//           «يخصّه». المطبخ ما له شغل بهندسة المنيو، والجودة ما لها شغل
//           بقائمة المشتريات — إخفاؤها أصدق من عرضها ثم رفضها.
//
// والحماية الفعلية على الكتابة تبقى في القاعدة: RLS + محفّزات. هذا الملف
// يرتّب ويخفي، ما يحرس.

import { ADMIN_ROLE, ALL_ROLES } from "./roles";
import type { Cap, Role } from "./roles";

/** مراحل التشغيل بالترتيب — الاسم المعروض فوق مجموعة الوحدات. */
export const OPS_STAGES = [
  { key: "input", label: "١ · الإدخال" },
  { key: "trial", label: "٢ · التجربة" },
  { key: "approve", label: "٣ · الاعتماد" },
  { key: "run", label: "٤ · التشغيل" },
  { key: "output", label: "٥ · المخرجات" },
  { key: "always", label: "دائم" },
] as const;

export type StageKey = (typeof OPS_STAGES)[number]["key"];

export interface OpsModule {
  href: string;
  label: string;
  view: Cap;
  edit?: Cap;
  desc: string;
  stage: StageKey;
  roles: Role[];
}

const ALL: Role[] = ALL_ROLES;

export const OPS_MODULES: OpsModule[] = [
  // ١ · الإدخال — الأرقام الخام تدخل هنا قبل أي اعتماد
  { href: "/admin/ops/recipes", label: "الوصفات", view: "recipes.view", edit: "recipes.edit", desc: "مكوّنات كل صنف بالجرام", stage: "input", roles: ALL },
  { href: "/admin/ops/ingredients", label: "المكوّنات", view: "ingredients.view", edit: "ingredients.editSpecs", desc: "القيم الغذائية والحساسية والموردون", stage: "input", roles: ALL },

  // ٢ · التجربة — الصنف يُطبخ ويُجرَّب قبل ما يوصل الاعتماد
  { href: "/admin/ops/pilot", label: "تجارب Pilot", view: "quality.view", edit: "pilot.edit", desc: "تجارب الطبخ ونتائجها قبل الاعتماد", stage: "trial", roles: ["kitchen", "quality"] },
  { href: "/admin/ops/kitchen-gate", label: "بوابة المطبخ", view: "quality.view", edit: "kitchenGate.edit", desc: "فحوص محسوبة وقرار الشيف", stage: "trial", roles: ["kitchen", "quality"] },

  // ٣ · الاعتماد — البوابات بالترتيب، وكل بوابة لمالكها
  { href: "/admin/ops/quality", label: "بوابات الاعتماد", view: "quality.view", edit: "quality.editGates", desc: "اعتماد كل صنف قبل البيع", stage: "approve", roles: ALL },

  // ٤ · التشغيل — بعد الاعتماد: جدولة، إنتاج، مراقبة
  { href: "/admin/ops/rotation", label: "جدول الدوران", view: "rotation.view", edit: "rotation.edit", desc: "أصناف كل يوم خلال 14 يوم", stage: "run", roles: ["kitchen"] },
  { href: "/admin/ops/production", label: "الإنتاج والمشتريات", view: "production.view", edit: "production.edit", desc: "حصص اليوم وقائمة الشراء", stage: "run", roles: ["kitchen", "finance"] },
  { href: "/admin/ops/kitchen-card", label: "بطاقة المطبخ", view: "card.view", desc: "أوزان الدفعة وطريقة التحضير", stage: "run", roles: ["kitchen", "quality"] },
  { href: "/admin/ops/inventory", label: "المخزون", view: "inventory.view", edit: "inventory.receive", desc: "الاستلام واللوطات والصرف والهدر", stage: "run", roles: ALL },
  { href: "/admin/safety/ccp", label: "سجل المراقبة", view: "safety.view", edit: "safety.log", desc: "قراءات النقاط الحرجة اليومية", stage: "run", roles: ["kitchen", "quality"] },

  // ٥ · المخرجات — اللي يطلع من كل اللي فوق
  { href: "/admin/launch", label: "قرار الإطلاق", view: "launch.view", desc: "GO / NO-GO ومحاور الجاهزية", stage: "output", roles: ALL },
  { href: "/admin/ops/menu", label: "المنيو", view: "ops.view", desc: "كل الأصناف بحالتها وقيمها", stage: "output", roles: ALL },
  { href: "/admin/ops/engineering", label: "هندسة المنيو", view: "engineering.view", edit: "engineering.view", desc: "تصنيف الأصناف حسب المبيعات والهامش", stage: "output", roles: ["finance"] },

  // دائم — ما له مرحلة: يُفتح في أي وقت
  { href: "/admin/requests", label: "الطلبات", view: "requests.view", desc: "التعديلات المرسلة وحالتها", stage: "always", roles: ALL },
  { href: "/admin/safety", label: "سلامة الغذاء", view: "safety.view", edit: "safety.plan", desc: "خطة HACCP والحدود الحرجة وبرامج PRP", stage: "always", roles: ["kitchen", "quality"] },
  { href: "/admin/safety/ncr", label: "عدم المطابقة", view: "safety.view", edit: "ncr.manage", desc: "البلاغات وأسبابها الجذرية", stage: "always", roles: ALL },
  { href: "/admin/ops/settings", label: "الإعدادات", view: "settings.edit", edit: "settings.edit", desc: "مضاعفات الحصص ونسب التكلفة", stage: "always", roles: ["executive"] },
];

/**
 * وحدات هذا الدور، مرتّبة بالمراحل. الدور الفاضي ما يشوف شي، والمالك يشوف
 * الكل: أدمن، فلا يُذكر في صفوف roles أعلاه ولا يُنقص ذلك من وصوله.
 */
export function modulesForRole(role: Role | null | undefined): OpsModule[] {
  if (!role) return [];
  if (role === ADMIN_ROLE) return OPS_MODULES;
  return OPS_MODULES.filter((m) => m.roles.includes(role));
}

/**
 * هل هذا المسار يخصّ هذا الدور؟ يُستعمل مع capForPath لا بدالها: الصلاحية
 * تقول «مسموح»، وهذي تقول «يخصّه». مسار ما هو وحدة أصلاً (مثل /admin) يرجع
 * true — الحكم عليه للصلاحية وحدها.
 */
export function moduleAllowsRole(pathname: string, role: Role | null | undefined): boolean {
  const hit = moduleForPath(pathname);
  if (!hit) return true;
  if (role === ADMIN_ROLE) return true;
  return !!role && hit.roles.includes(role);
}

/** الوحدة اللي يقع تحتها هذا المسار، أو null لو ما هو وحدة. */
export function moduleForPath(pathname: string): OpsModule | null {
  return (
    OPS_MODULES.filter((m) => pathname === m.href || pathname.startsWith(m.href + "/"))
      // أطول مسار مطابق أولاً: /admin/safety/ccp قبل /admin/safety
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}
