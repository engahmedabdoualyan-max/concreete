import ModuleListScreen, { type FieldDef } from "@/components/dashboard/ModuleListScreen";
import { erp } from "@/lib/firestore";
import { useRouter } from "expo-router";
import { VEHICLE_TYPES } from "@/lib/vehicle-type";

const VEHICLE_OPTIONS = VEHICLE_TYPES.map((v) => v.key);

const FIELDS: FieldDef[] = [
  { key: "email", label: "الإيميل" },
  { key: "password", label: "الباسورد" },
  { key: "role", label: "الدور" },
  { key: "roleAr", label: "الدور عربي" },
  { key: "phone", label: "التليفون" },
  { key: "truck", label: "نوع المركبة", type: "select", options: VEHICLE_OPTIONS },
  { key: "gps", label: "GPS" },
];

export default function AdminScreen() {
  const router = useRouter();
  return (
    <ModuleListScreen
      title="الإدارة — حسابات التطبيق"
      emoji="🛠️"
      accent="#E2E8F0"
      addLabel="إضافة حساب"
      emptyLabel="لا توجد حسابات في الشجرة"
      fields={FIELDS}
      load={async (u) => (await erp.loadCompanyTree(u))?.accounts || []}
      save={erp.saveCompanyTree}
      listTitle={(r) => r.email || r.id}
      listSub={(r) => `${r.roleAr || r.role || ""} · ${r.phone || ""} · ${r.truck ? `🚛 ${r.truck}` : ""}`}
      summaries={(l) => [
        { label: "الحسابات", value: String(l.length), color: "#E2E8F0" },
      ]}
      newRecord={() => ({ email: "", password: "Fimto@123", role: "driver", roleAr: "سائق", phone: "", truck: "", gps: "" })}
      headerActions={[
        { label: "المحطات", emoji: "🏭", onPress: () => router.push("/(dashboard)/admin-stations" as any) },
        { label: "المعدات", emoji: "🚚", onPress: () => router.push("/(dashboard)/admin-assets" as any) },
      ]}
    />
  );
}
