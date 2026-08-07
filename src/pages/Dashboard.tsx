import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type UserSession } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { loadTrips } from '../firebase/firestore';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import QuotaBanner from '../components/QuotaBanner';

interface Trip {
  id: number; plant: string; date: string; code: string; driver: string;
  qty: number; pump: string; estTime: number;
  stationArr: string; stationDep: string; siteArr: string; siteDep: string;
  siteName: string; projectName: string; status: string;
}

const COUNTRIES = ["Egypt", "Saudi Arabia", "UAE", "Kuwait", "Qatar", "Bahrain", "Oman", "Jordan", "Lebanon", "Iraq", "Yemen", "Other"];
const CITIES: Record<string, string[]> = {
  Egypt: ["Cairo", "Alexandria", "Giza", "Sharm El-Sheikh", "Hurghada"],
  "Saudi Arabia": ["Riyadh", "Jeddah", "Mecca", "Medina", "Dammam", "Khobar"],
  UAE: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman"],
  Kuwait: ["Kuwait City"],
  Qatar: ["Doha"],
  Bahrain: ["Manama"],
  Oman: ["Muscat"],
};

const LEFT_MODULES = [
  { label: "📦 Orders", color: "bg-cyan-600 hover:bg-cyan-700", module: "orders" },
  { label: "🔧 Workshop", color: "bg-orange-600 hover:bg-orange-700", module: "workshop" },
  { label: "🎛️ Mixing & Quality", color: "bg-red-700 hover:bg-red-800", module: "mixing" },
  { label: "📊 Evaluation", color: "bg-yellow-500 hover:bg-yellow-600 text-slate-900", module: "evaluation" },
];

const RIGHT_MODULES = [
  { label: "🚚 Operations", color: "bg-blue-600 hover:bg-blue-700", module: "operation" },
  { label: "🏭 Production", color: "bg-green-600 hover:bg-green-700", module: "production" },
  { label: "📅 Schedule", color: "bg-indigo-600 hover:bg-indigo-700", module: "schedule" },
  { label: "🔬 R&D", color: "bg-purple-600 hover:bg-purple-700", module: "rnd" },
];

const DEFAULT_TRIPS: Trip[] = [
  { id: 1, plant: "PLANT-A", date: "2026-06-18", code: "m01", driver: "Ahmed Ali", qty: 10, pump: "p01", estTime: 40, stationArr: "08:00", stationDep: "08:10", siteArr: "08:50", siteDep: "09:30", siteName: "vally damam", projectName: "dammam 1", status: "COMPLETED" },
  { id: 2, plant: "PLANT-A", date: "2026-06-18", code: "m02", driver: "Driver-2", qty: 10, pump: "p01", estTime: 45, stationArr: "10:00", stationDep: "10:11", siteArr: "10:56", siteDep: "11:40", siteName: "00 (kk)", projectName: "00 (kk)", status: "COMPLETED" },
  { id: 3, plant: "PLANT-B", date: "2026-06-18", code: "m03", driver: "Saeed John", qty: 10, pump: "p02", estTime: 30, stationArr: "09:00", stationDep: "09:12", siteArr: "09:42", siteDep: "10:20", siteName: "Khobar Site", projectName: "Tower B", status: "COMPLETED" },
];

function to12h(i: string): string {
  if (!i || i === "00:00" || i === "") return "--:--";
  const [e, t] = i.split(":").map(Number);
  if (isNaN(e) || isNaN(t)) return "--:--";
  const r = e >= 12 ? "PM" : "AM", l = e % 12 || 12;
  const d = t < 10 ? "0" + t : t;
  return `${l}:${d} ${r}`;
}

function diffMin(i: string, e: string): number {
  if (!i || !e || i === "00:00" || e === "00:00") return 0;
  const [h, m] = i.split(":").map(Number);
  const [h2, m2] = e.split(":").map(Number);
  if (isNaN(h) || isNaN(m) || isNaN(h2) || isNaN(m2)) return 0;
  let f = h * 60 + m, x = h2 * 60 + m2;
  if (x < f) x += 1440;
  return x - f;
}

function plantMins(i: string, e: string): number {
  const t = diffMin(i, e);
  if (t > 180) { const r = t - 720; return r < 0 ? Math.abs(r) : r; }
  return t;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { currentUser, login, register, verifyAndActivate, generatedCode, logout, loginAsGuest } = useAuth();
  const { canAccess, canManageAdmin } = useAdmin();
  const [showLogin, setShowLogin] = useState(!currentUser);
  const [tab, setTab] = useState<'login' | 'register' | 'verify'>('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentState, setSentState] = useState<boolean | null>(null);
  const [trips, setTrips] = useState<Trip[]>(DEFAULT_TRIPS);

  const [reg, setReg] = useState({ username: "", password: "", country: "Egypt", city: "", plantName: "", phonePrefix: "+20", phone: "", email: "" });
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [verifyCode, setVerifyCode] = useState("");

  useEffect(() => { setShowLogin(!currentUser); }, [currentUser]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('trips_data') || localStorage.getItem('trips');
      if (saved) setTrips(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    loadTrips(currentUser.username).then(data => {
      if (data && Array.isArray(data) && data.length > 0) setTrips(data);
      else {
        const saved = localStorage.getItem('trips_data') || localStorage.getItem('trips');
        if (saved) setTrips(JSON.parse(saved));
      }
    }).catch(() => {
      const saved = localStorage.getItem('trips_data') || localStorage.getItem('trips');
      if (saved) setTrips(JSON.parse(saved));
    });
  }, [currentUser?.username]);

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { username, password, country, city, plantName, phonePrefix, phone, email } = reg;
    if (!username || !password || !country || !city || !plantName || !phone || !email) {
      setError("Please fill all fields");
      setBusy(false);
      return;
    }
    const user: UserSession = {
      username, password, country, city,
      plantName, phone: phonePrefix + phone, email, status: "FREE_TRIAL",
    };
    const res = await register(user);
    if (res.success) {
      setSentState(res.emailSent);
      setTab('verify');
    } else {
      setError("Username already taken! Please choose another.");
    }
    setBusy(false);
  };

  const handleVerify = async () => {
    if (!verifyCode) { setError("Please enter verification code"); return; }
    const ok = await verifyAndActivate(verifyCode);
    if (ok) setShowLogin(false);
    else setError("Incorrect verification code!");
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const ok = await login(loginForm.username, loginForm.password);
    if (ok) setShowLogin(false);
    else setError("Invalid Credentials!");
  };

  const go = (module: string) => navigate(`/${module}`);

  const recent = trips.slice(-6).reverse();

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f1f5f9]">
      {/* ===== LOGIN MODAL ===== */}
      {showLogin && (
        <div className="fixed inset-0 z-[100] bg-[#0f172a]/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#1e293b] border border-[#334155] rounded-2xl w-full max-w-xl p-8 shadow-2xl max-h-[95vh] overflow-y-auto">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-extrabold text-white mb-2">
                {tab === "login" ? "Welcome Back" : tab === "register" ? "Create Account" : "Verify Email"}
              </h2>
              <p className="text-sm text-slate-400">Technical Management Program for Concrete Plants</p>
              <p className="text-xs text-emerald-500 mt-1 font-semibold">Design by Dr. Ahmad Abdo Alyan</p>
            </div>

            {tab === "register" && (
              <form onSubmit={handleRegister} className="space-y-3">
                <div className="bg-yellow-500/10 border border-dashed border-yellow-500 rounded-lg p-3 text-yellow-300 text-xs text-center mb-3">
                  🆓 Free Trial Registration — All features unlocked<br />
                  💾 Each account gets a private 300 MB storage database (قاعدة بيانات خاصة 300 ميجا)<br />
                  <span className="text-yellow-400/80">إذا احتجت قاعدة أكبر تواصل مع المبرمج بعد التسجيل</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col">
                    <label className="text-xs text-slate-400 font-semibold mb-1">Username *</label>
                    <input value={reg.username} onChange={o => setReg({ ...reg, username: o.target.value })} className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none focus:border-emerald-500" />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs text-slate-400 font-semibold mb-1">Password *</label>
                    <input type="password" value={reg.password} onChange={o => setReg({ ...reg, password: o.target.value })} className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none focus:border-emerald-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col">
                    <label className="text-xs text-slate-400 font-semibold mb-1">Country *</label>
                    <select value={reg.country} onChange={o => setReg({ ...reg, country: o.target.value, city: "" })} className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none">
                      {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs text-slate-400 font-semibold mb-1">City *</label>
                    <select value={reg.city} onChange={o => setReg({ ...reg, city: o.target.value })} className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none">
                      <option value="">Select City</option>
                      {(CITIES[reg.country] || []).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-slate-400 font-semibold mb-1">Plant / Company Name *</label>
                  <input value={reg.plantName} onChange={o => setReg({ ...reg, plantName: o.target.value })} placeholder="e.g. Al-Khaleej Concrete Plant" className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none focus:border-emerald-500" />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-slate-400 font-semibold mb-1">Phone Number *</label>
                  <div className="flex gap-2">
                    <select value={reg.phonePrefix} onChange={o => setReg({ ...reg, phonePrefix: o.target.value })} className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm w-[35%] outline-none">
                      <option value="+20">+20 (EG)</option>
                      <option value="+966">+966 (KSA)</option>
                      <option value="+971">+971 (UAE)</option>
                      <option value="+965">+965 (KW)</option>
                      <option value="+974">+974 (QA)</option>
                    </select>
                    <input value={reg.phone} onChange={o => setReg({ ...reg, phone: o.target.value })} placeholder="1001006627" className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm flex-1 outline-none focus:border-emerald-500" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-slate-400 font-semibold mb-1">Email *</label>
                  <input type="email" value={reg.email} onChange={o => setReg({ ...reg, email: o.target.value })} placeholder="example@email.com" className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none focus:border-emerald-500" />
                </div>
                {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                <button type="submit" disabled={busy} className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-700 disabled:cursor-wait text-white font-bold py-3 rounded-lg text-sm transition">
                  {busy ? "⏳ Sending Verification Code..." : "📧 Register & Send Verification Code"}
                </button>
                <p className="text-center text-sm text-slate-400 mt-3">
                  Already have an account? <span className="text-blue-400 cursor-pointer underline font-bold" onClick={() => { setTab('login'); setError(''); }}>Login</span>
                </p>
              </form>
            )}

            {tab === "verify" && (
              <div className="space-y-4">
                {sentState === true ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
                    <p className="text-emerald-400 text-2xl mb-2">📧</p>
                    <p className="text-sm text-slate-200 font-semibold">Verification Code Sent!</p>
                    <p className="text-xs text-slate-400 mt-1">
                      A 6-digit verification code has been sent to<br />
                      <strong className="text-blue-300 text-sm">{reg.email}</strong>
                    </p>
                    <p className="text-xs text-slate-500 mt-2">Please check your inbox and spam folder</p>
                  </div>
                ) : sentState === false ? (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
                    <p className="text-yellow-400 text-2xl mb-2">⚠️</p>
                    <p className="text-sm text-slate-200 font-semibold">Email Service Not Configured</p>
                    <p className="text-xs text-slate-400 mt-1">EmailJS keys not set. Use this code for verification:</p>
                    <p className="text-lg font-mono tracking-[0.3em] text-yellow-300 font-bold mt-2">{generatedCode}</p>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      Sending verification code to<br />
                      <strong className="text-blue-300">{reg.email}</strong>...
                    </p>
                  </div>
                )}
                <div className="flex flex-col">
                  <label className="text-xs text-slate-400 font-semibold mb-1">Verification Code</label>
                  <input value={verifyCode} onChange={o => setVerifyCode(o.target.value)} placeholder="Enter 6-digit code" className="bg-[#334155] border border-[#475569] rounded-lg p-3 text-white text-center text-lg tracking-widest outline-none focus:border-emerald-500" />
                </div>
                {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                <button onClick={handleVerify} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg transition">✅ Activate Account</button>
                <button
                  onClick={() => {
                    const u: UserSession = { ...reg, phone: reg.phonePrefix + reg.phone, status: "FREE_TRIAL" };
                    register(u).then(r => setSentState(r.emailSent));
                  }}
                  disabled={busy}
                  className="w-full bg-blue-600/20 hover:bg-blue-600/30 disabled:opacity-50 text-blue-400 font-bold py-2 rounded-lg text-sm transition border border-blue-500/30"
                >
                  {busy ? "⏳ Resending..." : "📧 Resend Verification Code"}
                </button>
                <button onClick={() => { setTab('register'); setError(''); setSentState(null); }} className="w-full text-slate-400 text-sm underline mt-2">← Back to Registration</button>
              </div>
            )}

            {tab === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="flex flex-col">
                  <label className="text-xs text-slate-400 font-semibold mb-1">Username</label>
                  <input value={loginForm.username} onChange={o => setLoginForm({ ...loginForm, username: o.target.value })} className="bg-[#334155] border border-[#475569] rounded-lg p-3 text-white outline-none focus:border-emerald-500" />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-slate-400 font-semibold mb-1">Password</label>
                  <input type="password" value={loginForm.password} onChange={o => setLoginForm({ ...loginForm, password: o.target.value })} className="bg-[#334155] border border-[#475569] rounded-lg p-3 text-white outline-none focus:border-emerald-500" />
                </div>
                {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg transition">🔓 Login</button>
                <button
                  type="button"
                  onClick={() => { loginAsGuest(); setShowLogin(false); }}
                  className="w-full bg-slate-600/30 hover:bg-slate-600/50 border border-slate-500/40 text-slate-300 font-bold py-3 rounded-lg transition text-sm mt-2"
                >
                  👤 Continue as Guest
                </button>
                <p className="text-center text-sm text-slate-400 mt-3">
                  Don't have an account? <span className="text-blue-400 cursor-pointer underline font-bold" onClick={() => { setTab('register'); setError(''); }}>Register Free</span>
                </p>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ===== HEADER ===== */}
      <header className="bg-[#1e293b] border-b border-[#334155] px-6 py-4 sticky top-0 z-10 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Technical Management Program for Concrete Plants</h1>
          <p className="text-xs text-emerald-500 font-medium">Design and Development by Dr. Ahmad Abdo Alyan</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <QuickJump />
          <LangSelector />
          {currentUser ? (
            <div className="flex items-center gap-2">
              <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">
                🟢 {currentUser.plantName} (Free Trial)
              </span>
              {canManageAdmin() && (
                <button
                  onClick={() => navigate('/admin')}
                  className="bg-purple-500/20 text-purple-400 text-xs px-3 py-1.5 rounded-lg font-bold border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
                >
                  Admin Panel
                </button>
              )}
              <button
                onClick={() => { logout(); navigate('/'); }}
                className="bg-red-500/20 text-red-400 text-xs px-3 py-1.5 rounded-lg font-bold border border-red-500/30 hover:bg-red-500/30 transition-colors"
              >
                Logout
              </button>
            </div>
          ) : (
            <span className="bg-slate-500/15 text-slate-400 text-xs px-3 py-1.5 rounded-lg font-bold border border-slate-500/30">
              Guest Session (🔒 Restricted)
            </span>
          )}
        </div>
      </header>

      {/* ===== STORAGE QUOTA BANNER ===== */}
      <div className="px-6 pt-4 max-w-[1100px] mx-auto w-full">
        <QuotaBanner />
      </div>

      {/* ===== MAIN ===== */}
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] p-8 bg-[radial-gradient(circle_at_center,#1e293b_0%,#0f172a_100%)]">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-8 max-w-[1100px] w-full items-center mb-8">
          {/* Left modules */}
          <div className="flex flex-col gap-6">
            {LEFT_MODULES.filter(m => canAccess(m.module)).map(m => (
              <button key={m.module} onClick={() => go(m.module)} className={`${m.color} py-6 px-4 rounded-lg text-white font-bold text-sm text-center cursor-pointer transition-all duration-200 hover:-translate-y-1 shadow-lg hover:shadow-xl min-h-[80px] flex items-center justify-center`}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Center hero */}
          <div className="flex flex-col gap-6 justify-center">
            {canAccess('schedule') && (
              <button onClick={() => go('schedule')} className="bg-cyan-500 hover:bg-cyan-600 py-6 px-4 rounded-lg text-white font-bold text-sm text-center cursor-pointer transition-all duration-200 hover:-translate-y-1 shadow-lg hover:shadow-xl min-h-[60px] flex items-center justify-center">
                📅 Smart Daily Pouring Schedule (جدول الصب الذكي)
              </button>
            )}
            <div className="bg-gradient-to-br from-blue-900 to-[#0f172a] border-2 border-blue-600 rounded-xl p-10 text-center shadow-2xl min-h-[220px] flex flex-col gap-4 justify-center">
              <h2 className="text-xl lg:text-2xl font-extrabold text-white leading-relaxed">
                Welcome to the<br />Technical Management Program<br />for Concrete Plants
              </h2>
              <p className="text-emerald-500 font-semibold text-sm border-t border-blue-400/20 pt-3">
                Design and Development by<br />Dr. Ahmad Abdo Alyan
              </p>
            </div>
          </div>

          {/* Right modules */}
          <div className="flex flex-col gap-6">
            {RIGHT_MODULES.filter(m => canAccess(m.module)).map(m => (
              <button key={m.module} onClick={() => go(m.module)} className={`${m.color} py-6 px-4 rounded-lg text-white font-bold text-sm text-center cursor-pointer transition-all duration-200 hover:-translate-y-1 shadow-lg hover:shadow-xl min-h-[80px] flex items-center justify-center`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* ===== FOOTER ===== */}
        <div className="max-w-[1100px] w-full text-center text-xs text-slate-400 border-t border-white/10 pt-6 mt-10 space-y-2">
          <p className="text-emerald-500 font-bold text-sm">🏗️ Technical Management Program - Enterprise ERP | Version 1.6</p>
          <p className="text-white font-semibold text-sm">Designed & Developed by Dr. Ahmed Abdou Alyan</p>
          <div className="flex gap-4 flex-wrap justify-center text-xs">
            <span>📞 <b>EG:</b> <a href="tel:0201001006627" className="text-blue-400 font-semibold">0201001006627</a></span>
            <span>📞 <b>KSA:</b> <a href="tel:+996500439617" className="text-blue-400 font-semibold">+996500439617</a></span>
            <span>📧 <b>Email:</b> <a href="mailto:ahmed@concrete-erp.com" className="text-blue-400 font-semibold">ahmed@concrete-erp.com</a></span>
          </div>
        </div>
      </div>

      {/* ===== RECENT TRIPS ===== */}
      <div className="max-w-6xl mx-auto px-4 pb-8">
        <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
          <h2 className="text-lg font-bold text-blue-400 mb-4">🚛 Recent Concrete Trips Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recent.map(t => {
              const p = plantMins(t.stationArr, t.stationDep);
              const je = diffMin(t.stationDep, t.siteArr);
              const Me = je > 120;
              return (
                <div key={t.id} className={`bg-[#0f172a] border rounded-lg p-4 ${Me ? "border-red-500 bg-gradient-to-br from-[#1e293b] to-red-950 animate-pulse" : "border-[#334155]"}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">{t.status}</span>
                    <span className="text-xs text-slate-400">{t.date}</span>
                  </div>
                  <h3 className="text-lg font-bold text-white">{t.code}</h3>
                  <div className="text-xs text-slate-400 mt-2 space-y-1">
                    <p><span className="text-slate-500">Plant:</span> <strong className="text-slate-300">{t.plant}</strong></p>
                    <p><span className="text-slate-500">Driver:</span> {t.driver}</p>
                    <p><span className="text-slate-500">Load:</span> {t.qty} m³ | Pump: {t.pump}</p>
                    <p><span className="text-slate-500">Project:</span> {t.siteName} ({t.projectName})</p>
                    <p className={p > 12 ? "text-red-400 font-bold" : "text-green-400 font-bold"}>
                      🏭 Plant: {p > 12 ? `Delay ${p - 12}m` : `On Time (${p}m)`}
                    </p>
                    <p className={Me ? "text-red-400 font-extrabold animate-pulse" : je > Number(t.estTime) ? "text-red-400 font-bold" : "text-green-400 font-bold"}>
                      🚚 Transit: {Me ? `🚨 CRITICAL ${je}m (>2hrs)` : je > Number(t.estTime) ? `Delay ${je - Number(t.estTime)}m` : `On Time (${je}m)`}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-[#334155]/30 text-[10px] text-slate-400">
                    <div>Arr Plant: <span className="text-white">{to12h(t.stationArr)}</span></div>
                    <div>Dep Plant: <span className="text-white">{to12h(t.stationDep)}</span></div>
                    <div>Arr Site: <span className="text-white">{to12h(t.siteArr)}</span></div>
                    <div>Dep Site: <span className="text-white">{to12h(t.siteDep)}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
