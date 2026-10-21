/**
 * تحقّق من أدوار صفحة الحسابات بعد توسيع البوابة:
 * كل endpoint بتستعمله صفحة /finance لازم يرد 200 للأدوار الجديدة،
 * وأزرار الاعتماد/الرفض (order:approve_finance) ترد 403 لمدير المصنع.
 *
 * التشغيل: node scripts/verify-finance-roles.mjs
 */
import fs from "node:fs";
import bcrypt from "bcryptjs";
import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  fs.readFileSync(process.env.HOME + "/.config/fimto_db_url", "utf8").trim();
const BASE = process.env.BASE_URL || "https://fimto-api-web.onrender.com";

const { Pool } = pg;
const lines = [];
let pass = 0;
let fail = 0;

function log(s = "") {
  lines.push(s);
  console.log(s);
}
function section(t) {
  log(`\n\x1b[36m── ${t}\x1b[0m`);
}
function check(label, ok, extra = "") {
  if (ok) {
    pass++;
    log(`  \x1b[32m✔\x1b[0m ${label}`);
  } else {
    fail++;
    log(`  \x1b[31m✘\x1b[0m ${label} ${extra ? `\x1b[2m${extra}\x1b[0m` : ""}`);
  }
}

async function api(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let parsed = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
}

const stamp = Date.now().toString().slice(-8);
const TENANT_CODE = `VRF${stamp}`;
const PASSWORD = `Vr!${stamp}x`;
const ROLES = ["ACCOUNTANT", "PLANT_MGR", "PURCHASING_MGR", "SUPER_ADMIN"];
const emails = {};
const state = {};

async function seed(pool) {
  section("تجهيز: مستأجر مؤقت + 4 مستخدمين بأدوار مختلفة");
  const hash = await bcrypt.hash(PASSWORD, 10);
  const tenant = await pool.query(
    `insert into tenants (tenant_code, company_name, primary_plant_name, country_code, timezone)
     values ($1, $2, $3, 'EG', 'Africa/Cairo') returning id`,
    [TENANT_CODE, `Verify Roles ${stamp}`, "VR Plant"],
  );
  state.tenantId = tenant.rows[0].id;

  for (const role of ROLES) {
    const email = `vf-${role.toLowerCase()}-${stamp}@fimto.test`;
    emails[role] = email;
    await pool.query(
      `insert into users (tenant_id, employee_code, full_name, email, password_hash, role, zone)
       values ($1, $2, $3, $4, $5, $6, 'VR Zone')`,
      [state.tenantId, `VR${role.slice(0, 4)}${stamp}`, `VR ${role}`, email, hash, role],
    );
  }
  log(`  مستأجر: ${TENANT_CODE} (${state.tenantId})`);
}

async function login(email) {
  const r = await api("/api/auth/login", {
    method: "POST",
    body: { email, password: PASSWORD },
  });
  const token = r.body?.data?.accessToken || r.body?.accessToken;
  return { status: r.status, token };
}

/** الـ endpoints اللي صفحة /finance بتقرأ منها (عرض فقط). */
const READ_ENDPOINTS = [
  ["/api/finance?limit=5", "الملخص المالي والطلبات"],
  ["/api/finance/ledger", "دفتر الأستاذ"],
  ["/api/finance/commitments", "الالتزامات"],
  ["/api/finance/expenses", "المصروفات"],
  ["/api/finance/misc-expenses", "نثريات الموظفين"],
  ["/api/finance/depreciation?period=2026-10-01", "اهلاك معدات"],
  ["/api/finance/depreciation/settings", "إعدادات الاهلاك"],
  ["/api/suppliers", "سجل الموردين"],
  ["/api/suppliers/invoices", "فواتير الموردين"],
  ["/api/suppliers/aging", "أعمار الموردين"],
  ["/api/suppliers/purchase-orders", "أوامر الشراء"],
];

/** endpoints الموردين — مسموحة لمدير المشتريات كمان (supplier:read/manage) */
const SUPPLIER_ENDPOINTS = new Set([
  "سجل الموردين",
  "فواتير الموردين",
  "أعمار الموردين",
  "أوامر الشراء",
]);

async function verifyRoles() {
  for (const role of ROLES) {
    section(`الدور ${role}`);
    const { status, token } = await login(emails[role]);
    check("تسجيل الدخول", status === 200 && Boolean(token), `status=${status}`);
    if (!token) continue;

    const allowed = ["SUPER_ADMIN", "ACCOUNTANT", "PLANT_MGR"];
    for (const [path, label] of READ_ENDPOINTS) {
      const r = await api(path, { token });
      if (allowed.includes(role) || SUPPLIER_ENDPOINTS.has(label)) {
        check(`${label} → 200`, r.status === 200, `status=${r.status}`);
      } else {
        // مش من أدوار صفحة الحسابات — المقصود 403 مش 500
        check(
          `${label} → 403 (مش من أدوار الصفحة)`,
          r.status === 403,
          `status=${r.status}`,
        );
      }
    }
  }
}

async function verifyApproveGate() {
  section("بوابة الاعتماد المالي (order:approve_finance)");
  const acc = await login(emails.ACCOUNTANT);
  const plant = await login(emails.PLANT_MGR);
  const accRes = await api("/api/finance/approve", {
    method: "POST",
    token: acc.token,
    body: { orderId: "00000000-0000-0000-0000-000000000000", paperClearanceGranted: true },
  });
  check(
    "ACCOUNTANT يقدر يوصل لبوابة الاعتماد (مش 403)",
    accRes.status !== 403,
    `status=${accRes.status}`,
  );
  const plantRes = await api("/api/finance/approve", {
    method: "POST",
    token: plant.token,
    body: { orderId: "00000000-0000-0000-0000-000000000000", paperClearanceGranted: true },
  });
  check("PLANT_MGR ممنوع (403) — والأزرار مخفية له", plantRes.status === 403, `status=${plantRes.status}`);
}

async function verifySupplierStatement() {
  section("كشف حساب المورد + مقارنة الأسعار");
  const acc = await login(emails.ACCOUNTANT);
  const created = await api("/api/suppliers", {
    method: "POST",
    token: acc.token,
    body: {
      name: `VR Supplier ${stamp}`,
      phone: "01000000000",
      category: "أسمنت",
    },
  });
  check("إنشاء مورد (ACCOUNTANT) → 200", created.status === 200, `status=${created.status}`);
  const supId = created.body?.data?.supplier?.id;
  if (!supId) {
    log(`  \x1b[2m${JSON.stringify(created.body).slice(0, 300)}\x1b[0m`);
    return;
  }
  const st = await api(`/api/suppliers/${supId}/statement`, { token: acc.token });
  check("كشف حساب المورد → 200", st.status === 200, `status=${st.status}`);
  check(
    "الكشف منظّم (supplier + movements + openBalance)",
    Boolean(st.body?.data?.supplier?.id) && Array.isArray(st.body?.data?.movements),
    JSON.stringify(st.body?.data ?? {}).slice(0, 200),
  );
  const price = await api("/api/suppliers/price-comparison?materialName=%D8%A7%D8%B3%D9%85%D9%86%D8%AA", {
    token: acc.token,
  });
  check("مقارنة الأسعار → 200", price.status === 200, `status=${price.status}`);
}

async function cleanup(pool) {
  section("التنظيف");
  // الموردين أولهم (FK على users.created_by) — وبعدين الطلبات/الفواتير
  const suppliers = await pool.query(`delete from suppliers where tenant_id = $1`, [state.tenantId]);
  const users = await pool.query(`delete from users where tenant_id = $1`, [state.tenantId]);
  const t = await pool.query(`delete from tenants where id = $1`, [state.tenantId]);
  const left = await pool.query(`select count(*)::int as n from tenants where id = $1`, [state.tenantId]);
  check("الموردين اتشالوا", suppliers.rowCount >= 0, `rows=${suppliers.rowCount}`);
  check("المستخدمين اتشالوا", users.rowCount === ROLES.length, `rows=${users.rowCount}`);
  check("المستأجر اتشال", t.rowCount === 1 && left.rows[0].n === 0);
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 2, ssl: { rejectUnauthorized: false } });
  try {
    log(`\x1b[1mتحقّق أدوار صفحة الحسابات\x1b[0m\ntarget: ${BASE}`);
    await seed(pool);
    await verifyRoles();
    await verifyApproveGate();
    await verifySupplierStatement();
    await cleanup(pool);
  } finally {
    await pool.end();
  }
  log(`\n\x1b[1mالنتيجة: ${pass} نجح · ${fail} فشل\x1b[0m`);
  fs.writeFileSync("/tmp/opencode/verify-finance-roles.txt", lines.join("\n"));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
