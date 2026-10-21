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
