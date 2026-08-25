import ModuleListScreen, { type FieldDef } from "@/components/dashboard/ModuleListScreen";
import { erp } from "@/lib/firestore";

const ASSET_TYPES = ["Mixer", "Mixer Pump", "Stationary Pump", "Truck", "Loader", "Other"];
const ASSET_STATUS = ["Ready", "Workshop", "Down"];

const FIELDS: FieldDef[] = [
  { key: "plate", label: "اللوحة" },
  { key: "chassis", label: "الشاصي" },
  { key: "type", label: "النوع", type: "select", options: ASSET_TYPES },
  { key: "status", label: "الحالة", type: "select", options: ASSET_STATUS },
  { key: "driver", label: "السائق" },
  { key: "gpsId", label: "معرّف GPS" },
  { key: "regExpiry", label: "انتهاء الرخص", type: "date" },
];

export default function AdminAssetsScreen() {
  return (
    <ModuleListScreen
      title="المعدات"
      emoji="🚚"
      accent="#34D399"
      addLabel="إضافة معدة"
      emptyLabel="لا توجد معدات — أضف أول معدة"
      fields={FIELDS}
      load={async (u) => (await erp.loadAssets(u)) || []}
      save={erp.saveAssets}
      listTitle={(r) => r.plate || r.id}
      listSub={(r) => `${r.type || ""} · ${r.status || "Ready"}${r.driver ? ` · ${r.driver}` : ""}`}
      summaries={(l) => [
        { label: "المعدات", value: String(l.length), color: "#34D399" },
        { label: "جاهزة", value: String(l.filter((a) => a.status === "Ready").length), color: "#34D399" },
        { label: "ورشة", value: String(l.filter((a) => a.status === "Workshop").length), color: "#F87171" },
      ]}
      newRecord={() => ({
        plate: "",
        chassis: "",
        type: "Mixer",
        status: "Ready",
        driver: "",
        gpsId: "",
        regExpiry: "",
      })}
    />
  );
}
