// قراءة صورة المخزون من القاعدة — خادم فقط.
//
// منفصل عن inventory.ts لأن ذاك تستورده شاشة العميل: استيراد
// @/lib/supabase/server من ملف يصل المتصفّح يجرّ next/headers معه.

import { createClient } from "@/lib/supabase/server";
import type { InventorySnapshot, GrnVerdict, StorageMode, WasteReason, WasteStatus } from "./inventory";

const n = (v: unknown) => Number(v ?? 0);
const s = (v: unknown) => String(v ?? "");

/**
 * صورة المخزون كاملةً. ما يرجع منها محكوم بسياسات RLS، فالقراءة نفسها
 * مفلترة من القاعدة لا من هنا.
 */
export async function loadInventory(): Promise<InventorySnapshot> {
  const db = await createClient();

  const [stockQ, lotsQ, balQ, movesQ, wasteQ, ingQ, setQ] = await Promise.all([
    db.from("ops_stock_on_hand_v").select("*"),
    db.from("ops_stock_lots").select("*").order("id", { ascending: false }),
    db.from("ops_lot_balance_v").select("*"),
    db.from("ops_stock_moves").select("*").order("id", { ascending: false }).limit(500),
    db.from("ops_waste_requests").select("*").order("id", { ascending: false }).limit(200),
    db.from("ops_ingredients").select("key,name,price").neq("active", false).order("name"),
    db.from("ops_settings").select("data").eq("id", 1).maybeSingle(),
  ]);

  const balById = new Map<number, { balance_g: unknown; issuable: unknown }>();
  for (const b of balQ.data ?? []) balById.set(Number(b.lot_id), b);

  const nameByKey = new Map<string, string>();
  for (const i of ingQ.data ?? []) nameByKey.set(s(i.key), s(i.name));

  const settings = (setQ.data?.data ?? {}) as Record<string, unknown>;

  return {
    stock: (stockQ.data ?? []).map((r) => ({
      key: s(r.ingredient_key),
      name: s(r.name),
      usableG: n(r.usable_g),
      totalG: n(r.total_g),
      nearestExpiry: r.nearest_expiry ? s(r.nearest_expiry) : null,
      valueSar: n(r.value_sar),
      reorderPointG: n(r.reorder_point_g),
      belowReorder: r.below_reorder === true,
    })),
    lots: (lotsQ.data ?? []).map((r) => {
      const b = balById.get(Number(r.id));
      return {
        id: Number(r.id),
        ingredientKey: s(r.ingredient_key),
        ingredientName: nameByKey.get(s(r.ingredient_key)) ?? s(r.ingredient_key),
        supplier: s(r.supplier),
        supplierLot: s(r.supplier_lot),
        expiryDate: s(r.expiry_date),
        receivedQtyG: n(r.received_qty_g),
        storageMode: s(r.storage_mode) as StorageMode,
        receiptTempC: r.receipt_temp_c === null ? null : n(r.receipt_temp_c),
        verdict: s(r.verdict) as GrnVerdict,
        verdictReason: s(r.verdict_reason),
        unitPriceSnap: n(r.unit_price_snap),
        balanceG: n(b?.balance_g),
        issuable: b?.issuable === true,
        receivedByName: s(r.received_by_name),
        receivedAt: s(r.received_at),
      };
    }),
    moves: (movesQ.data ?? []).map((r) => ({
      id: Number(r.id),
      lotId: Number(r.lot_id),
      kind: s(r.kind),
      qtyG: n(r.qty_g),
      batchNo: s(r.batch_no),
      wasteReason: r.waste_reason ? (s(r.waste_reason) as WasteReason) : null,
      thawLossPct: r.thaw_loss_pct === null ? null : n(r.thaw_loss_pct),
      note: s(r.note),
      ref: s(r.ref),
      movedByName: s(r.moved_by_name),
      movedAt: s(r.moved_at),
    })),
    waste: (wasteQ.data ?? []).map((r) => ({
      id: Number(r.id),
      lotId: Number(r.lot_id),
      qtyG: n(r.qty_g),
      reason: s(r.reason) as WasteReason,
      note: s(r.note),
      valueSar: n(r.value_sar),
      limitSar: n(r.limit_sar),
      status: s(r.status) as WasteStatus,
      raisedByName: s(r.raised_by_name),
      raisedAt: s(r.raised_at),
      decidedByName: s(r.decided_by_name),
      decidedAt: r.decided_at ? s(r.decided_at) : null,
      decisionNote: s(r.decision_note),
    })),
    ingredients: (ingQ.data ?? []).map((i) => ({ key: s(i.key), name: s(i.name), price: n(i.price) })),
    wasteLimitSar: Number(settings.wasteApprovalLimitSar ?? 200),
    expiryWarnDays: Number(settings.expiryWarnDays ?? 7),
  };
}
