import ModuleListScreen, { type FieldDef } from "@/components/dashboard/ModuleListScreen";
import { erp } from "@/lib/firestore";

const FIELDS: FieldDef[] = [
  { key: "orderNo", label: "رقم الطلب" },
  { key: "customer", label: "العميل" },
  { key: "siteName", label: "الموقع" },
  { key: "grade", label: "التصميم" },
  { key: "qty", label: "الكمية م³", numeric: true },
  { key: "date", label: "التاريخ", type: "date" },
  { key: "status", label: "الحالة" },
];

export default function OrdersScreen() {
  return (
    <ModuleListScreen
      title="الطلبات"
      emoji="📦"
      accent="#38BDF8"
      addLabel="إضافة طلب"
      emptyLabel="لا توجد طلبات بعد"
      fields={FIELDS}
      load={erp.loadOrders}
      save={erp.saveOrders}
      listTitle={(r) => `طلب ${r.orderNo || r.id} — ${r.customer || "—"}`}
      listSub={(r) => `${r.siteName || "—"} · ${r.grade || "—"} · ${r.qty ?? ""} م³ · ${r.status || ""}`}
      summaries={(l) => [
        { label: "إجمالي الطلبات", value: String(l.length), color: "#38BDF8" },
        { label: "كمية إجمالية م³", value: String(l.reduce((s, r) => s + (Number(r.qty) || 0), 0)), color: "#34D399" },
      ]}
      newRecord={() => ({ orderNo: "", customer: "", siteName: "", grade: "", qty: "10", date: new Date().toISOString().slice(0, 10), status: "SCHEDULED" })}
    />
  );
}
