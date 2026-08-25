import ModuleListScreen, { type FieldDef } from "@/components/dashboard/ModuleListScreen";
import { erp } from "@/lib/firestore";

const FIELDS: FieldDef[] = [
  { key: "sample", label: "رقم العينة" },
  { key: "date", label: "التاريخ" },
  { key: "grade", label: "التصميم" },
  { key: "slump", label: "Slump (مم)", numeric: true },
  { key: "temp", label: "الحرارة °C", numeric: true },
  { key: "status", label: "النتيجة" },
];

export default function MixingScreen() {
  return (
    <ModuleListScreen
      title="المختبر والجودة"
      emoji="🧪"
      accent="#FBBF24"
      addLabel="إضافة فحص"
      emptyLabel="لا توجد فحوصات جودة"
      fields={FIELDS}
      load={erp.loadQCRecords}
      save={erp.saveQCRecords}
      listTitle={(r) => `عينة ${r.sample || r.id} — ${r.grade || "—"}`}
      listSub={(r) => `${r.date || "—"} · Slump ${r.slump ?? ""} مم · ${r.temp ?? ""}°C · ${r.status || ""}`}
      summaries={(l) => [
        { label: "الفحوصات", value: String(l.length), color: "#FBBF24" },
        { label: "مطابقة", value: String(l.filter((r) => /pass|accept|ok|مطابق/i.test(String(r.status || ""))).length), color: "#34D399" },
        { label: "غير مطابقة", value: String(l.filter((r) => /fail|reject|رفض/i.test(String(r.status || ""))).length), color: "#F87171" },
      ]}
      newRecord={() => ({ sample: "", date: new Date().toISOString().slice(0, 10), grade: "", slump: "100", temp: "25", status: "PENDING" })}
    />
  );
}
