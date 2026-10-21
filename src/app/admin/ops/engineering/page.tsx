"use client";

import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { ENG_CLASS, computeEngineering } from "@/lib/ops/engine";
import { useOps } from "@/lib/ops/store";
import { AccessNote, Card, CardTitle, ErrorNote, Loading, NumInput, OpsShell, T, TableWrap, Td, Th, pct, sar } from "@/components/ops/ui";
import { useStage } from "@/lib/ops/stage";

export default function EngineeringPage() {
  const ops = useOps();
  const stage = useStage();
  const [error, setError] = useState("");
  const rows = useMemo(() => computeEngineering(ops.computed, ops.state.unitsSold), [ops.computed, ops.state.unitsSold]);

  if (!ops.ready) {
    return (
      <OpsShell title="هندسة المنيو">
        <Loading />
      </OpsShell>
    );
  }

  const groups = [...new Set(rows.map((r) => r.group))];

  return (
    <OpsShell title="هندسة المنيو" subtitle="مصفوفة Kasavana–Smith — تصنيف كل صنف حسب شعبيته وهامشه داخل مجموعته">
      <AccessNote
        canEdit
        editText="أدخل وحدات كل صنف المباعة خلال 4 أسابيع. المقارنة تتم داخل المجموعة نفسها، ولا تحكم على صنف قبل حوالي 100 وحدة للمجموعة."
        viewText=""
      />
      <ErrorNote text={error} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {(Object.keys(ENG_CLASS) as (keyof typeof ENG_CLASS)[]).map((k) => (
          <div key={k} className="rounded-2xl p-4" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <div className="text-sm font-bold mb-1">{ENG_CLASS[k].label}</div>
            <div className="text-[11px] leading-relaxed" style={{ color: T.inkSoft }}>{ENG_CLASS[k].action}</div>
            <div className="text-lg font-extrabold mt-2" style={{ color: T.brand }}>{rows.filter((r) => r.cls === k).length}</div>
          </div>
        ))}
      </div>

      {groups.map((g) => {
        const list = rows.filter((r) => r.group === g);
        const gUnits = list[0]?.groupUnits ?? 0;
        return (
          <Card key={g} className="mb-6">
            <CardTitle
              icon={<BarChart3 size={17} />}
              aside={
                <span className="text-[11px]" style={{ color: T.inkSoft }}>
                  وحدات المجموعة: <span className="font-bold">{gUnits}</span> · حد الشعبية: {pct(list[0]?.popThreshold)} · متوسط الهامش: {sar(list[0]?.avgMargin)}
                </span>
              }
            >
              {g}
            </CardTitle>
            <TableWrap>
              <thead>
                <tr>
                  <Th>رقم</Th>
                  <Th>الصنف</Th>
                  <Th>السعر</Th>
                  <Th>التكلفة الكلية</Th>
                  <Th>هامش/طبق</Th>
                  <Th align="center">وحدات مباعة</Th>
                  <Th>حصة المبيعات</Th>
                  <Th>التصنيف</Th>
                  <Th>الإجراء المقترح</Th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.sku.item.id} className="border-t" style={{ borderColor: T.border }}>
                    <Td>{r.sku.item.id}</Td>
                    <Td strong>{r.sku.item.name}</Td>
                    <Td>{sar(r.sku.price, 0)}</Td>
                    <Td>{sar(r.sku.totalCost)}</Td>
                    <Td strong>{sar(r.margin)}</Td>
                    <Td className="text-center">
                      <NumInput
                        ariaLabel={`وحدات ${r.sku.item.name}`}
                        value={r.units}
                        placeholder="—"
                        onCommit={async (v) => {
                          const res = await stage.setUnitsSold(r.sku.item.id, v);
                          setError(res.ok ? "" : res.error);
                        }}
                      />
                    </Td>
                    <Td>{pct(r.share)}</Td>
                    <Td strong>{r.cls ? ENG_CLASS[r.cls].label : "—"}</Td>
                    <Td><span style={{ color: T.inkSoft }}>{r.cls ? ENG_CLASS[r.cls].action : "—"}</span></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>
        );
      })}
    </OpsShell>
  );
}
