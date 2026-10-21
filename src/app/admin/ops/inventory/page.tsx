// شاشة المخزون — تقرأ صورة المخزون على الخادم وتمرّرها للعميل.
//
// القراءة هنا لا في العميل: ما يرجع منها محكوم بسياسات RLS، فالتصفية تصير
// في القاعدة لا في المتصفّح.

import { loadInventory } from "@/lib/ops/inventory-server";
import InventoryClient from "./InventoryClient";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const snapshot = await loadInventory();
  return <InventoryClient snap={snapshot} />;
}
