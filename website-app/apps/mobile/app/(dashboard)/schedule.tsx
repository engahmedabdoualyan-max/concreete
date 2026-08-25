import ModuleListScreen, { type FieldDef } from "@/components/dashboard/ModuleListScreen";
import { erp } from "@/lib/firestore";

const FIELDS: FieldDef[] = [
  { key: "name", label: "اسم العميل" },
  { key: "phone", label: "التليفون" },
  { key: "city", label: "المدينة" },
  { key: "siteName", label: "الموقع" },
  { key: "project", label: "المشروع" },
  { key: "date", label: "اليوم", type: "date" },
  { key: "time", label: "الساعة", type: "time" },
];

export default function ScheduleScreen() {
  return (
    <ModuleListScreen
      title="الجدول"
      emoji="📅"
      accent="#2DD4BF"
      addLabel="إضافة عميل"
      emptyLabel="لا يوجد عملاء مسجلون"
      fields={FIELDS}
      load={erp.loadCustomers}
      save={erp.saveCustomers}
      listTitle={(r) => r.name || r.id}
      listSub={(r) => `${r.phone || "—"} · ${r.city || "—"} · ${r.siteName || "—"} · ${r.project || "—"}${r.date ? ` · ${r.date}` : ""}${r.time ? ` 🕐${r.time}` : ""}`}
      summaries={(l) => [
        { label: "العملاء", value: String(l.length), color: "#2DD4BF" },
      ]}
      newRecord={() => ({ name: "", phone: "", city: "", siteName: "", project: "", date: new Date().toISOString().slice(0, 10), time: "08:00" })}
    />
  );
}
