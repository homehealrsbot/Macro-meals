// أنواع المخزون وتسمياته — بلا أي استيراد من الخادم.
//
// الفصل مقصود: شاشة العميل تستورد الأنواع من هنا، ولو كانت دالّة القراءة
// في نفس الملف جرّت معها next/headers إلى حزمة المتصفّح وانكسر البناء.
// القراءة في inventory-server.ts.
//
// وما فيه حساب رصيد في أي منهما: الرصيد يجي محسوباً من عرض
// ops_lot_balance_v في القاعدة. حسابه مرة ثانية في الواجهة يعني رقمين
// لنفس الشي يفترقان أول ما يتغيّر أحد التعريفين.

export type StorageMode = "CHILLED" | "FROZEN" | "AMBIENT";
export type GrnVerdict = "ACCEPT" | "HOLD" | "REJECT";
export type WasteStatus = "PENDING" | "APPROVED" | "REJECTED";
export type WasteReason =
  | "EXPIRED" | "DAMAGED" | "COLD_CHAIN" | "CONTAMINATION"
  | "PREP_ERROR" | "SUPPLIER_RETURN" | "OTHER";

export const STORAGE_LABEL: Record<StorageMode, string> = {
  CHILLED: "مبرّد",
  FROZEN: "مجمّد",
  AMBIENT: "جاف",
};

export const VERDICT_LABEL: Record<GrnVerdict, string> = {
  ACCEPT: "مقبول",
  HOLD: "محجوز",
  REJECT: "مرفوض",
};

export const WASTE_REASON_LABEL: Record<WasteReason, string> = {
  EXPIRED: "منتهي الصلاحية",
  DAMAGED: "تالف",
  COLD_CHAIN: "انقطاع سلسلة التبريد",
  CONTAMINATION: "تلوّث",
  PREP_ERROR: "خطأ تحضير",
  SUPPLIER_RETURN: "مرتجع للمورد",
  OTHER: "أخرى",
};

export interface StockRow {
  key: string;
  name: string;
  usableG: number;
  totalG: number;
  nearestExpiry: string | null;
  valueSar: number;
  standardPriceSar: number;
  unpricedLots: number;
  reorderPointG: number;
  belowReorder: boolean;
}

export interface LotRow {
  id: number;
  ingredientKey: string;
  ingredientName: string;
  supplier: string;
  supplierLot: string;
  expiryDate: string;
  receivedQtyG: number;
  storageMode: StorageMode;
  receiptTempC: number | null;
  verdict: GrnVerdict;
  verdictReason: string;
  unitPriceSnap: number;        // السعر المعياري وقت الاستلام — للمقارنة
  invoicePriceSar: number | null; // سعر الفاتورة الفعلي — للمالي وحده
  invoiceNo: string;
  pricedByName: string;
  priceVariancePct: number | null;
  costPerKg: number;
  unpriced: boolean;
  valueSar: number;
  balanceG: number;
  issuable: boolean;
  receivedByName: string;
  receivedAt: string;
  // قرار المالك على المحجوز — يحتاجه سرد حركة الشحنة: مين فكّ الحجز ومتى
  // ولأي سبب. ورفضُه ما يترك أثراً في الدفتر، فما يُروى إلا من هنا.
  decidedByName: string;
  decidedAt: string | null;
  decisionNote: string;
}

export interface MoveRow {
  id: number;
  lotId: number;
  kind: string;
  qtyG: number;
  batchNo: string;
  wasteReason: WasteReason | null;
  thawLossPct: number | null;
  note: string;
  ref: string;
  movedByName: string;
  movedAt: string;
}

export interface WasteRow {
  id: number;
  lotId: number;
  qtyG: number;
  reason: WasteReason;
  note: string;
  valueSar: number;
  limitSar: number;
  status: WasteStatus;
  raisedByName: string;
  raisedAt: string;
  decidedByName: string;
  decidedAt: string | null;
  decisionNote: string;
}

export interface InventorySnapshot {
  stock: StockRow[];
  lots: LotRow[];
  moves: MoveRow[];
  waste: WasteRow[];
  ingredients: { key: string; name: string; price: number }[];
  wasteLimitSar: number;
  expiryWarnDays: number;
  priceVarianceWarnPct: number;
}

// ============================================================ سرد الشحنة

/**
 * آخر كم حركة تُقرأ من الدفتر. الرقم هنا لا في القارئ وحده، لأن الشاشة
 * تحتاج تعرف أنها بلغت السقف حتى تقول للمالك إن السرد مقصوص.
 */
export const MOVES_LIMIT = 1000;

export type LotEventKind =
  | "RECEIPT" | "HOLD" | "RELEASE" | "REJECT"
  | "ISSUE" | "WASTE" | "ADJUST" | "THAW"
  | "WASTE_RAISED" | "WASTE_REFUSED";

export interface LotEvent {
  key: string;
  at: string;
  kind: LotEventKind;
  title: string;
  by: string;
  /** null يعني حدثاً ما مسّ الرصيد: حجز، أو طلب إعدام ينتظر، أو رفض. */
  qtyG: number | null;
  /** الرصيد بعد الحدث — null للأحداث بلا كمية. */
  balanceG: number | null;
  detail: string;
  tone: "in" | "out" | "hold" | "plain";
}

export interface LotStory {
  lot: LotRow;
  events: LotEvent[];
  lastAt: string;
}

const KIND_TITLE: Record<string, string> = {
  RECEIPT: "استلام الشحنة",
  ISSUE: "صرف للإنتاج",
  WASTE: "إعدام معتمد — نزل من الرصيد",
  ADJUST: "تسوية جرد",
  THAW: "تذويب",
};

function joinDetail(...parts: (string | null | undefined)[]): string {
  return parts.filter((p) => p && p.trim()).join(" · ");
}

// نسخة مصغّرة من num() في مكوّنات الواجهة: هذا الملف لا يستورد منها، لأنها
// وحدة عميل تجرّ next/link و next/image معها.
const g = (v: number) => v.toLocaleString("en-US");

/**
 * قصّة كل شحنة: إيش صار لها ومين سوّاه ومتى ولأي سبب.
 *
 * الدفتر وحده ما يكفي سرداً: الحجز ما يترك فيه حركة، ورفض الشحنة ولا رفض
 * الإعدام يترك أثراً فيه أصلاً — الدفتر يسجّل الكميات لا الأحكام. فالسرد
 * يجمع الثلاثة: حركات الدفتر، وقرار المالك على الشحنة، وطلبات الإعدام.
 *
 * والرصيد يُحسب رجوعاً من رصيد اللوط الذي جاء محسوباً من العرض: لو كان
 * الدفتر المقروء مقصوصاً عند السقف، بقي آخر سطر مطابقاً للقاعدة وانزاح
 * أقدمه — والعكس (الحساب تقدّماً من الصفر) يجعل آخر سطر يكذّب الرصيد
 * المعروض فوقه.
 */
export function buildLotStories(snap: InventorySnapshot): LotStory[] {
  const movesByLot = new Map<number, MoveRow[]>();
  for (const m of snap.moves) {
    const arr = movesByLot.get(m.lotId);
    if (arr) arr.push(m); else movesByLot.set(m.lotId, [m]);
  }
  const wasteByLot = new Map<number, WasteRow[]>();
  for (const w of snap.waste) {
    const arr = wasteByLot.get(w.lotId);
    if (arr) arr.push(w); else wasteByLot.set(w.lotId, [w]);
  }

  const stories: LotStory[] = [];

  for (const lot of snap.lots) {
    const events: LotEvent[] = [];

    // ١) الحجز: ما له حركة في الدفتر، ويُعرف من أن اللوط محجوز الآن أو أنه
    //    مرّ بقرار — والقرار لا يقع إلا على محجوز.
    if (lot.verdict === "HOLD" || lot.decidedAt) {
      events.push({
        key: `hold:${lot.id}`,
        at: lot.receivedAt,
        kind: "HOLD",
        title: "وصلت وحُجزت — ما دخلت الرصيد",
        by: lot.receivedByName,
        qtyG: null,
        balanceG: null,
        detail: joinDetail(lot.verdictReason, `${STORAGE_LABEL[lot.storageMode]}`,
          lot.receiptTempC === null ? "" : `حرارة الاستلام ${lot.receiptTempC}°م`),
        tone: "hold",
      });
    }

    // ٢) رفض الشحنة: نهايتها، وما يبقى منها أثر في الدفتر.
    if (lot.verdict === "REJECT") {
      events.push({
        key: `reject:${lot.id}`,
        at: lot.decidedAt ?? lot.receivedAt,
        kind: "REJECT",
        title: "رفضها المالك — رجعت للمورد",
        by: lot.decidedByName,
        qtyG: null,
        balanceG: null,
        detail: lot.decisionNote,
        tone: "hold",
      });
    }

    // ٣) حركات الدفتر — هي العمود الفقري للسرد.
    for (const m of movesByLot.get(lot.id) ?? []) {
      const release = m.kind === "RECEIPT" && m.ref.startsWith("release:");
      events.push({
        key: `m:${m.id}`,
        at: m.movedAt,
        kind: release ? "RELEASE" : (m.kind as LotEventKind),
        title: release ? "فكّ المالك الحجز — دخلت الرصيد" : (KIND_TITLE[m.kind] ?? m.kind),
        by: m.movedByName,
        qtyG: m.qtyG,
        balanceG: null,
        detail: joinDetail(
          m.batchNo ? `دفعة ${m.batchNo}` : "",
          m.wasteReason ? WASTE_REASON_LABEL[m.wasteReason] : "",
          m.thawLossPct === null ? "" : `فقد التذويب ${(m.thawLossPct * 100).toFixed(1)}%`,
          m.note,
        ),
        tone: m.qtyG > 0 ? "in" : "out",
      });
    }

    // ٤) طلبات الإعدام. المعتمَد منها له حركة فوق، فما نكرّره هنا إلا إذا
    //    احتاج قراراً — عشان يبيّن مين رفعه ومين اعتمده، لا اسم واحد.
    for (const w of wasteByLot.get(lot.id) ?? []) {
      const judged = w.status === "PENDING" || w.decidedByName !== "";
      if (judged) {
        events.push({
          key: `wr:${w.id}`,
          at: w.raisedAt,
          kind: "WASTE_RAISED",
          title: w.status === "PENDING"
            ? "رُفع طلب إعدام — ينتظر المالك والرصيد ما نقص"
            : "رُفع طلب إعدام",
          by: w.raisedByName,
          qtyG: null,
          balanceG: null,
          detail: joinDetail(WASTE_REASON_LABEL[w.reason], `${g(w.qtyG)} غ`, w.note),
          tone: "hold",
        });
      }
      if (w.status === "REJECTED") {
        events.push({
          key: `wd:${w.id}`,
          at: w.decidedAt ?? w.raisedAt,
          kind: "WASTE_REFUSED",
          title: "رفض المالك الإعدام — الرصيد كما هو",
          by: w.decidedByName,
          qtyG: null,
          balanceG: null,
          detail: w.decisionNote,
          tone: "hold",
        });
      }
    }

    if (events.length === 0) continue;

    events.sort((a, b) => (a.at === b.at ? a.key.localeCompare(b.key) : a.at.localeCompare(b.at)));

    // الرصيد رجوعاً من الرصيد المحسوب في القاعدة
    let running = lot.balanceG;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.qtyG === null) continue;
      e.balanceG = running;
      running -= e.qtyG;
    }

    stories.push({ lot, events, lastAt: events[events.length - 1].at });
  }

  stories.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  return stories;
}
