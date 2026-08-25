import ModuleListScreen, { type FieldDef } from "@/components/dashboard/ModuleListScreen";
import { erp } from "@/lib/firestore";

const FIELDS: FieldDef[] = [
  { key: "batch", label: "الدفعة" },
  { key: "date", label: "التاريخ" },
  { key: "product", label: "المنتج" },
  { key: "qty", label: "الكمية م³", numeric: true },
  { key: "machine", label: "الخلاطة" },
  { key: "status", label: "الحالة" },
];

export default function ProductionScreen() {
  return (
    <ModuleListScreen
      title="الإنتاج"
      emoji="🏭"
      accent="#34D399"
      addLabel="إضافة دفعة"
      emptyLabel="لا توجد دفعات إنتاج"
      fields={FIELDS}
      load={erp.loadProductionRuns}
      save={erp.saveProductionRuns}
      listTitle={(r) => `دفعة ${r.batch || r.id} — ${r.product || "—"}`}
      listSub={(r) => `${r.date || "—"} · ${r.machine || "—"} · ${r.qty ?? ""} م³ · ${r.status || ""}`}
      summaries={(l) => [
        { label: "دفعات الإنتاج", value: String(l.length), color: "#34D399" },
        { label: "م³ إجمالي", value: String(l.reduce((s, r) => s + (Number(r.qty) || 0), 0)), color: "#38BDF8" },
      ]}
      newRecord={() => ({ batch: "", date: new Date().toISOString().slice(0, 10), product: "", qty: "10", machine: "", status: "RUNNING" })}
    />
  );
}
