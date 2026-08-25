import ModuleListScreen, { type FieldDef } from "@/components/dashboard/ModuleListScreen";
import { erp } from "@/lib/firestore";

const STATION_STATUS = ["Running", "Maintenance", "Stopped"];
const PRODUCT_TYPE = ["concrete", "blocks", "both"];

const FIELDS: FieldDef[] = [
  { key: "name", label: "اسم المحطة" },
  { key: "plantId", label: "معرّف المصنع" },
  { key: "productType", label: "نوع المنتج", type: "select", options: PRODUCT_TYPE },
  { key: "operator", label: "اسم المشغل" },
  { key: "location", label: "الموقع" },
  { key: "installDate", label: "تاريخ التركيب", type: "date" },
  { key: "status", label: "الحالة", type: "select", options: STATION_STATUS },
  { key: "notes", label: "ملاحظات" },
];

export default function AdminStationsScreen() {
  return (
    <ModuleListScreen
      title="المحطات"
      emoji="🏭"
      accent="#38BDF8"
      addLabel="إضافة محطة"
      emptyLabel="لا توجد محطات — أضف أول محطة (تظهر لفني صيانة المحطة)"
      fields={FIELDS}
      load={async (u) => (await erp.loadStations(u)) || []}
      save={erp.saveStations}
      listTitle={(r) => r.name || "محطة"}
      listSub={(r) => `${r.operator || ""} · ${r.location || ""} · ${r.status || "Running"}`}
      summaries={(l) => [
        { label: "المحطات", value: String(l.length), color: "#38BDF8" },
        { label: "تعمل", value: String(l.filter((s) => s.status === "Running").length), color: "#34D399" },
      ]}
      newRecord={() => ({
        name: "",
        plantId: "",
        productType: "concrete",
        operator: "",
        location: "",
        installDate: new Date().toISOString().slice(0, 10),
        status: "Running",
        notes: "",
      })}
    />
  );
}
