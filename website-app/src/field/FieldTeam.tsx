import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { loadCompanyTree, saveCompanyTree } from "../firebase/firestore";
import { TREE_ROLES, treeModsForRole } from "../lib/treeRoles";

/**
 * Field team management (owner-only desktop-first screen).
 * Lists the plant's tree accounts and adds new ones (email + password +
 * phone + role with automatic mods) into the same `companyTrees` doc the
 * Console + mobile app use. No website design touched.
 */
interface Account {
  email: string;
  password: string;
  passwordHash?: string;
  phone: string;
  role: string;
  roleAr: string;
  permissions: string[];
  mods: string[];
  truck: string;
  gps: string;
}

const inputCls =
  "w-full px-3 py-2.5 bg-white/[0.04] border border-white/10 text-white rounded-xl text-sm focus:outline-none focus:border-sky-400/70 placeholder-slate-500";

export default function FieldTeam() {
  const { currentUser } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ email: "", password: "", phone: "", role: "driver" });

  const myCompany = (currentUser?.plantName || currentUser?.username || "").toLowerCase();

  const reload = async () => {
    if (!myCompany) return;
    setBusy(true);
    try {
      const tree = await loadCompanyTree(myCompany);
      setCompany(tree?.companyUsername || myCompany);
      const list: Record<string, unknown>[] = Array.isArray(tree?.accounts)
        ? (tree.accounts as unknown as Record<string, unknown>[])
        : [];
      setAccounts(
        list.map((a) => ({
          email: String(a.email || ""),
          password: String(a.password || ""),
          passwordHash: String(a.passwordHash || ""),
          phone: String(a.phone || ""),
          role: String(a.role || ""),
          roleAr: String(a.roleAr || a.role || ""),
          permissions: Array.isArray(a.permissions) ? (a.permissions as string[]) : [],
          mods: Array.isArray(a.mods) ? (a.mods as string[]) : treeModsForRole(String(a.role || "")),
          truck: String(a.truck || ""),
          gps: String(a.gps || ""),
        }))
      );
    } catch {
      setMsg("تعذر تحميل الشجرة — تحقق من الاتصال");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myCompany]);

  const addAccount = async () => {
    if (!form.email.trim() || !form.password || !myCompany) {
      setMsg("أدخل البريد وكلمة السر على الأقل");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const role = TREE_ROLES.find((r) => r.key === form.role);
      const entry: Account = {
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phone: form.phone.trim(),
        role: form.role,
        roleAr: role?.ar || form.role,
        permissions: role?.perms || [],
        mods: role ? [...role.mods] : treeModsForRole(form.role),
        truck: "",
        gps: "",
      };
      const next = [...accounts, entry];
      await saveCompanyTree({ companyUsername: company || myCompany, accounts: next } as never);
      setAccounts(next);
      setForm({ email: "", password: "", phone: "", role: "driver" });
      setMsg("✅ تمت إضافة الحساب للشجرة");
    } catch {
      setMsg("⚠️ تعذر الحفظ — تحقق من الاتصال والصلاحيات");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-black text-white">👥 فريقي — {company || "…"}</h2>
        <Link to="/field" className="text-xs text-slate-400 hover:text-white border border-white/10 rounded-lg px-3 py-2">→ الميدان</Link>
      </div>
      <p className="text-xs text-slate-500 mb-4">حسابات الشجرة ({accounts.length}) — تُستخدم في الموبايل والديسكتوب معاً</p>

      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 mb-4">
        <p className="text-sm font-black text-white mb-3">➕ حساب جديد</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="البريد (للدخول)" dir="ltr" className={inputCls} />
          <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="كلمة السر" className={inputCls} />
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="الهاتف (05xxxxxxxx)" dir="ltr" className={inputCls} />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={`${inputCls} bg-[#0B111E]`}>
            {TREE_ROLES.map((r) => (
              <option key={r.key} value={r.key}>{r.ar}</option>
            ))}
          </select>
        </div>
        <button
          onClick={addAccount}
          disabled={busy}
          className="w-full mt-3 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 disabled:opacity-50 text-white text-sm font-black py-2.5 rounded-xl"
        >
          {busy ? "⏳ جارٍ الحفظ..." : "إضافة للشجرة"}
        </button>
        {msg && <p className="text-xs font-bold text-slate-300 mt-2">{msg}</p>}
      </div>

      <div className="space-y-2">
        {accounts.map((a, i) => (
          <div key={`${a.email}-${i}`} className="border border-white/10 bg-white/[0.03] rounded-xl px-4 py-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-white" dir="ltr">{a.email}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{a.roleAr || a.role} · <span dir="ltr">{a.phone}</span></p>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-bold whitespace-nowrap">{a.roleAr || a.role}</span>
          </div>
        ))}
        {accounts.length === 0 && !busy && <p className="text-xs text-slate-500 text-center py-6">لا حسابات ظاهرة — تحقق من اتصال الشجرة</p>}
      </div>
    </div>
  );
}
