// الأدوار والصلاحيات — مصدر واحد يحدد مين يشوف إيش ومين يعدّل إيش.
//
// هذا الملف نقي بقصد: بلا "use client" وبلا React. الدور يُفحص في ثلاث طبقات
// — Server Actions، ومكوّنات العميل، وسياسات RLS — فلازم can و MATRIX
// يشتغلون على الجهتين. سياق React للجلسة في src/lib/ops/session.tsx.
//
// الدور يجي من الخادم: جلسة Supabase مُوقَّعة + صف المستخدم في جدول staff.
// الفحوصات هنا (can / capForPath) للواجهة فقط — تخفي اللي ما يخص الدور وتمنع
// الأزرار. الحماية الفعلية في قاعدة البيانات: سياسات RLS في supabase/schema.sql
// تمنع أي كتابة خارج صلاحية الدور، فتعديل الواجهة أو الكوكيز ما يفيد شي.

export type Role = "executive" | "finance" | "kitchen" | "quality";

/**
 * الأدوار كلها، مرتّبة بسلطتها. مصدر واحد بقصد: كان هذا الثلاثي مكتوباً حرفياً
 * في أحد عشر ملفاً، فإضافة دور كانت تعني تتبّعها كلها — وأي موضع يُنسى يسقط منه
 * الدور بلا خطأ يبيّن: عمود ناقص في جدول صلاحيات، أو دور غائب عن قائمة اختيار.
 * من يضيف دوراً بعد اليوم يضيفه هنا وحده.
 */
export const ALL_ROLES: Role[] = ["executive", "finance", "kitchen", "quality"];

/** الأدمن. كل شيء مفتوح له — انظر can() و sealsGate أدناه. */
export const ADMIN_ROLE: Role = "executive";

export const ROLES: Record<Role, { label: string; short: string; desc: string; home: string }> = {
  executive: {
    label: "المالك — أدمن",
    short: "المالك",
    desc: "كل شيء مفتوح: يعدّل أي شيء، ويعتمد أي شيء، ويتجاوز أي حساب أو قفل",
    home: "/admin",
  },
  finance: {
    label: "الإدارة المالية",
    short: "مالية",
    desc: "الأسعار والتكاليف والهوامش، قائمة المشتريات، هندسة المنيو، وبوابة السعر",
    home: "/admin/executive",
  },
  kitchen: {
    label: "المطبخ",
    short: "مطبخ",
    desc: "خطة الإنتاج، المشتريات، بطاقة المطبخ، الوصفات، وجدول الدوران",
    home: "/admin/kitchen",
  },
  quality: {
    label: "الجودة والمتابعة",
    short: "جودة",
    desc: "بوابات الاعتماد، الحساسية، الصلاحية، واعتماد الموردين",
    home: "/admin/ops/quality",
  },
};

export type Cap =
  | "ops.view"
  | "production.view"
  | "production.edit"
  | "shopping.view"
  | "card.view"
  | "rotation.view"
  | "rotation.edit"
  | "recipes.view"
  | "recipes.edit"
  | "ingredients.view"
  | "ingredients.editSpecs"
  | "ingredients.editPrice"
  | "quality.view"
  | "quality.editGates"
  | "quality.editPriceGate"
  | "quality.editShelfLife"
  | "inventory.view"
  | "inventory.receive"
  | "inventory.issue"
  | "inventory.decide"
  | "yield.spec"
  | "yield.check"
  | "gateDefs.manage"
  | "launch.view"
  | "launchAxes.manage"
  | "requests.view"
  | "pilot.edit"
  | "kitchenGate.edit"
  | "safety.view"
  | "safety.plan"
  | "safety.log"
  | "safety.verify"
  | "ncr.raise"
  | "ncr.manage"
  | "ingApproval.edit"
  | "ingApproval.editPrice"
  | "finance.view"
  | "settings.edit"
  | "engineering.view"
  | "audit.view"
  | "team.manage"
  | "data.reset"
  | "legacy.executive"
  | "legacy.kitchen"
  | "legacy.safetyLogs";

const ALL: Role[] = ALL_ROLES;

/**
 * مين يملك كل صلاحية.
 *
 * اقرأ هذا الجدول على أنه الملكية لا الوصول: المالك (ADMIN_ROLE) يمرّ على كل
 * صلاحية بحكم can() أدناه وإن لم يُذكر في صفّها، فلا تستنتج من غيابه عن صفٍّ
 * أنه ممنوع منه. وما يُذكر فيه «executive» صريحاً هو ما لا يملكه أحد غيره:
 * الإعدادات، والفريق، وتعريف البوابات والمحاور، والسجل، والتصفير.
 *
 * والمال كله انتقل إلى الإدارة المالية: الأسعار، والهوامش، وقائمة المشتريات،
 * وهندسة المنيو، وبوابة السعر، واعتماد سعر المكوّن. المالك يبقى قادراً عليها
 * كلها — لكن ملكيتها صارت لدور مستقل، فيُقرأ من الجدول من يُسأل عنها.
 */
export const MATRIX: Record<Cap, Role[]> = {
  "ops.view": ALL,
  "production.view": ALL,
  "production.edit": ["kitchen"],
  "shopping.view": ["kitchen", "finance"],
  "card.view": ALL,
  "rotation.view": ALL,
  "rotation.edit": ["kitchen"],
  "recipes.view": ALL,
  "recipes.edit": ["kitchen"],
  "ingredients.view": ALL,
  // المطبخ يُدخل المكوّنات والجودة تراجعها — الاثنان يكتبان المواصفة، والسعر
  // ليس منها: هو عمود منفصل للمالية يحرسه محفّز في القاعدة.
  "ingredients.editSpecs": ["kitchen", "quality"],
  "ingredients.editPrice": ["finance"],
  "quality.view": ALL,
  "quality.editGates": ["quality"],
  "quality.editPriceGate": ["finance"],
  "quality.editShelfLife": ["quality"],
  // مرجع الـyield للمالك وحده: هو الرقم الذي يُقاس عليه المطبخ، فلو ملكه
  // المطبخ قاس نفسه على رقمٍ يملك تغييره وصارت المطابقة بلا معنى.
  // المخزون: الاستلام والصرف للمطبخ (هو من يدخل المكوّنات)، والقرار على
  // المحجوز والهدر الكبير للمالك. والرؤية للكل: إخفاء المخزون عن الجودة
  // يعني مراجعة عمياء، وعن المالية يعني تقييماً بلا أرقام.
  "inventory.view": ALL,
  "inventory.receive": ["kitchen"],
  "inventory.issue": ["kitchen"],
  "inventory.decide": ["executive"],
  "yield.spec": ["executive"],
  "yield.check": ["kitchen", "quality"],
  "gateDefs.manage": ["executive"],
  // لوحة الجاهزية يشوفها كل دور: هي اللي تقول لقسمه وش يوقف الإطلاق. أما
  // تعريف المحاور نفسها فللمالك — القسم ما يشيل المحور اللي يقيسه.
  "launch.view": ALL,
  "launchAxes.manage": ["executive"],
  // كل موظف يشوف طلباته؛ واللي ينتظر قراره تحدده سلطة الاعتماد في
  // ops_change_kinds لا هذي المصفوفة.
  "requests.view": ALL,
  "pilot.edit": ["quality"],
  "kitchenGate.edit": ["kitchen"],
  // سلامة الغذاء: الجودة تضع الخطة والحدود، والمطبخ يسجّل المراقبة، والجودة
  // تعتمد بتوقيع ثانٍ. وأي موظف يرفع عدم مطابقة — منع التبليغ أسوأ من بلاغ زائد.
  "safety.view": ALL,
  "safety.plan": ["quality"],
  "safety.log": ["kitchen", "quality"],
  "safety.verify": ["quality"],
  "ncr.raise": ALL,
  "ncr.manage": ["quality"],
  "ingApproval.edit": ["quality"],
  "ingApproval.editPrice": ["finance"],
  "finance.view": ["finance"],
  "settings.edit": ["executive"],
  "engineering.view": ["finance"],
  "audit.view": ["executive"],
  "team.manage": ["executive"],
  "data.reset": ["executive"],
  "legacy.executive": ["finance"],
  "legacy.kitchen": ["kitchen"],
  "legacy.safetyLogs": ["kitchen", "quality"],
};

/**
 * المالك أدمن: كل شيء مفتوح له — قرار صاحب النظام، مُتَّخَذ بعلم أن الضوابط
 * التي يتجاوزها (فصل التوقيعين على سجل المراقبة، البوابات المحسوبة، ملكية
 * البوابة) موضوعة أصلاً ليمنع بعضها بعضاً. ونفس القاعدة حرفياً في القاعدة:
 * private.has_role تُرجع صح للمالك قبل أن تنظر في القائمة المسموحة، فما تفتحه
 * الواجهة هنا تفتحه السياسة هناك ولا يفترقان.
 */
export function can(role: Role | null | undefined, cap: Cap): boolean {
  if (!role) return false;
  if (role === ADMIN_ROLE) return true;
  return MATRIX[cap].includes(role);
}

/**
 * الأدوار التي تفتح صلاحية ما — للعرض. تُحسب من can() لا من MATRIX مباشرة،
 * لأن قراءة MATRIX وحدها تُسقط المالك فتقول «ممنوع» وهو يفتحها.
 */
export function rolesWithCap(cap: Cap): Role[] {
  return ALL_ROLES.filter((r) => can(r, cap));
}

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ALL_ROLES as string[]).includes(v);
}

/**
 * مين يختم بوابة اعتماد؟ الدور المكتوب في owner_role في تعريفها بقاعدة
 * البيانات — لا رقم بوابة مكتوب في الكود.
 *
 * كان الشرط «البوابة ٧ للتنفيذي وما عداها للجودة»، مكرراً في ثلاث أماكن:
 * السياسة، والـAction، والشاشة. أي بوابة جديدة كانت تحتاج تعديل الثلاثة.
 * الآن الشرط واحد ومصدره صف التعريف، ونفس التعبير حرفياً في سياسة RLS على
 * ops_gates و ops_ing_approvals، فما تعرض الواجهة زراً ترفضه القاعدة.
 *
 * ownerRole = null يعني بوابة محسوبة (تجارب Pilot + قرار الشيف): ما يختمها
 * أحد يدوياً، يكتبها محفّز في القاعدة.
 *
 * ومين يملك تغيير التعريفات نفسها (يضيف بوابة، يوقفها، ينقل ملكيتها)؟
 * المالك وحده — صلاحية "gateDefs.manage".
 *
 * والمالك يختم أي بوابة: بوابة غيره، والمحسوبة كذلك. والمحسوبة هي الحالة
 * التي يُقصد بها «يتجاوز أي حساب» — بوابة المطبخ تُحسب من تجارب Pilot وقرار
 * الشيف، فختمها يدوياً يعني إعلان جاهزية صنف لم تنجح تجاربه. مسموح له،
 * ومسجَّل عليه في سجل التعديلات باسمه.
 */
export function sealsGate(role: Role | null | undefined, ownerRole: string | null | undefined): boolean {
  if (!role) return false;
  if (role === ADMIN_ROLE) return true;
  return !!ownerRole && role === ownerRole;
}

// جدول الصلاحيات المعروض للمستخدم (مين يسوي إيش) — الميزات الثابتة فقط.
//
// صفوف البوابات والاعتمادات ما هي مكتوبة هنا: تُبنى من التعريفات في القاعدة
// عبر approvalPermissionRows أدناه. قبل كان السطر «بوابات الجودة (7 بوابات)»
// — رقم في نص، يكذب أول ما تضيف الأقسام بوابة.
export const PERMISSION_ROWS: { label: string; view: Cap; edit?: Cap }[] = [
  { label: "خطة الإنتاج (عدد الحصص)", view: "production.view", edit: "production.edit" },
  { label: "قائمة المشتريات (كميات)", view: "shopping.view" },
  { label: "بطاقة المطبخ", view: "card.view" },
  { label: "جدول الدوران 14 يوم", view: "rotation.view", edit: "rotation.edit" },
  { label: "الوصفات (الجرامات)", view: "recipes.view", edit: "recipes.edit" },
  { label: "المكوّنات: القيم الغذائية والحساسية", view: "ingredients.view", edit: "ingredients.editSpecs" },
  { label: "المكوّنات: الأسعار", view: "finance.view", edit: "ingredients.editPrice" },
  { label: "مرجع الـyield: نيئ ← مطبوخ", view: "recipes.view", edit: "yield.spec" },
  { label: "قياس الـyield الفعلي (مطابقة المطبخ)", view: "recipes.view", edit: "yield.check" },
  { label: "تسجيل تجارب Pilot", view: "quality.view", edit: "pilot.edit" },
  { label: "قرار الشيف على بوابة المطبخ", view: "quality.view", edit: "kitchenGate.edit" },
  { label: "الأسعار والتكاليف والهوامش", view: "finance.view" },
  { label: "إعدادات الحصص والتكلفة", view: "settings.edit", edit: "settings.edit" },
  { label: "هندسة المنيو (المبيعات)", view: "engineering.view", edit: "engineering.view" },
  { label: "سجل التعديلات", view: "audit.view" },
  { label: "الفريق: إضافة موظف ودوره وإيقافه", view: "team.manage", edit: "team.manage" },
  { label: "تعريف بوابات الاعتماد (إضافة/إيقاف/نقل ملكية)", view: "quality.view", edit: "gateDefs.manage" },
  { label: "خطة HACCP والحدود الحرجة", view: "safety.view", edit: "safety.plan" },
  { label: "سجل مراقبة النقاط الحرجة اليومي", view: "safety.view", edit: "safety.log" },
  { label: "اعتماد سجل المراقبة (توقيع ثانٍ)", view: "safety.view", edit: "safety.verify" },
  { label: "رفع عدم مطابقة", view: "safety.view", edit: "ncr.raise" },
  { label: "معالجة عدم المطابقة وإغلاقها", view: "safety.view", edit: "ncr.manage" },
  { label: "لوحة قرار الإطلاق (GO / NO-GO)", view: "launch.view" },
  { label: "إرسال التعديلات كطلبات", view: "requests.view" },
  { label: "تعريف محاور الجاهزية", view: "launch.view", edit: "launchAxes.manage" },
  { label: "قواعد الإرسال والاعتماد (مين يرسل ومين يعتمد)", view: "team.manage", edit: "team.manage" },
];

/** صف صلاحية لبوابة اعتماد واحدة، مبني من تعريفها لا من الكود. */
export interface ApprovalPermissionRow {
  label: string;
  owner: Role | null;
  computed: boolean; // بوابة محسوبة: ما يختمها أحد يدوياً
  active: boolean;
}

/**
 * يحوّل تعريفات البوابات والاعتمادات إلى صفوف صلاحيات للعرض. النوع هنا بنيوي
 * بقصد (label / ownerRole / active) عشان ملف الأدوار يبقى بلا استيراد من
 * المحرك — طبقة الصلاحيات ما تعرف شي عن المعادلات.
 */
export function approvalPermissionRows(
  defs: readonly { label: string; ownerRole: string | null; active: boolean }[],
): ApprovalPermissionRow[] {
  return defs.map((d) => ({
    label: d.label,
    owner: isRole(d.ownerRole) ? d.ownerRole : null,
    computed: d.ownerRole === null,
    active: d.active,
  }));
}

// أي مسار يحتاج أي صلاحية — الأطول أولاً
export const ROUTE_CAPS: { prefix: string; cap: Cap }[] = [
  { prefix: "/admin/ops/settings", cap: "settings.edit" },
  { prefix: "/admin/ops/engineering", cap: "engineering.view" },
  { prefix: "/admin/ops/production", cap: "production.view" },
  { prefix: "/admin/ops/kitchen-card", cap: "card.view" },
  { prefix: "/admin/ops/rotation", cap: "rotation.view" },
  { prefix: "/admin/ops/recipes", cap: "recipes.view" },
  { prefix: "/admin/ops/ingredients", cap: "ingredients.view" },
  { prefix: "/admin/ops/kitchen-gate", cap: "quality.view" },
  { prefix: "/admin/ops/quality", cap: "quality.view" },
  { prefix: "/admin/ops/pilot", cap: "quality.view" },
  { prefix: "/admin/ops/inventory", cap: "inventory.view" },
  { prefix: "/admin/ops", cap: "ops.view" },
  { prefix: "/admin/team", cap: "team.manage" },
  { prefix: "/admin/safety", cap: "safety.view" },
  { prefix: "/admin/executive", cap: "legacy.executive" },
  { prefix: "/admin/kitchen", cap: "legacy.kitchen" },
  { prefix: "/admin/expiry", cap: "legacy.safetyLogs" },
];

export function capForPath(pathname: string): Cap | null {
  const hit = ROUTE_CAPS.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
  return hit ? hit.cap : null;
}

export interface Session {
  userId: string;
  email: string;
  role: Role;
  name: string;
}
