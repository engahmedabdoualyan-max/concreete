import ModuleListScreen, { type FieldDef } from "@/components/dashboard/ModuleListScreen";
import { erp } from "@/lib/firestore";

const FIELDS: FieldDef[] = [
  { key: "name", label: "اسم الوصفة" },
  { key: "grade", label: "التصميم" },
  { key: "cement", label: "أسمنت كجم", numeric: true },
  { key: "sand", label: "رمل كجم", numeric: true },
  { key: "agg", label: "زلط كجم", numeric: true },
  { key: "water", label: "ماء لتر", numeric: true },
];

export default function RndScreen() {
  return (
    <ModuleListScreen
      title="البحث والتطوير"
      emoji="⚗️"
      accent="#60A5FA"
      addLabel="إضافة وصفة"
      emptyLabel="لا توجد وصفات مسجلة"
      fields={FIELDS}
      load={erp.loadRecipes}
      save={erp.saveRecipes}
      listTitle={(r) => `${r.name || r.id} (${r.grade || "—"})`}
      listSub={(r) => `أسمنت ${r.cement ?? ""} · رمل ${r.sand ?? ""} · زلط ${r.agg ?? ""} · ماء ${r.water ?? ""}`}
      summaries={(l) => [
        { label: "الوصفات", value: String(l.length), color: "#60A5FA" },
      ]}
      newRecord={() => ({ name: "", grade: "", cement: "400", sand: "700", agg: "1200", water: "180" })}
    />
  );
}
