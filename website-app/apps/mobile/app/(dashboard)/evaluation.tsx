import ModuleListScreen, { type FieldDef } from "@/components/dashboard/ModuleListScreen";
import { erp } from "@/lib/firestore";

const FIELDS: FieldDef[] = [
  { key: "date", label: "التاريخ" },
  { key: "plant", label: "المصنع" },
  { key: "oee", label: "OEE %", numeric: true },
  { key: "avail", label: "التوفر %", numeric: true },
  { key: "perf", label: "الأداء %", numeric: true },
  { key: "quality", label: "الجودة %", numeric: true },
];

export default function EvaluationScreen() {
  return (
    <ModuleListScreen
      title="التقييم"
      emoji="📊"
      accent="#FB7185"
      addLabel="إضافة تقييم"
      emptyLabel="لا توجد سجلات تقييم"
      fields={FIELDS}
      load={erp.loadOEELogs}
      save={erp.saveOEELogs}
      listTitle={(r) => `${r.plant || "—"} — ${r.date || ""}`}
      listSub={(r) => `OEE ${r.oee ?? ""}% · توفر ${r.avail ?? ""}% · أداء ${r.perf ?? ""}% · جودة ${r.quality ?? ""}%`}
      summaries={(l) => {
        const avg = (k: string) => (l.length ? (l.reduce((s, r) => s + (Number(r[k]) || 0), 0) / l.length).toFixed(1) : "0");
        return [
          { label: "سجلات", value: String(l.length), color: "#FB7185" },
          { label: "متوسط OEE", value: `${avg("oee")}%`, color: "#38BDF8" },
        ];
      }}
      newRecord={() => ({ date: new Date().toISOString().slice(0, 10), plant: "PLANT-A", oee: "80", avail: "85", perf: "90", quality: "95" })}
    />
  );
}
