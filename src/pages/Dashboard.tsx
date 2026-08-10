import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type UserSession } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { loadTrips } from '../firebase/firestore';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';
import QuotaBanner from '../components/QuotaBanner';
import mainPhoto from '../assets/logos/mainphoto.png';

interface Trip {
  id: number; plant: string; date: string; code: string; driver: string;
  qty: number; pump: string; estTime: number;
  stationArr: string; stationDep: string; siteArr: string; siteDep: string;
  siteName: string; projectName: string; status: string;
}

interface ModuleDef {
  access: string;
  path: string;
  en: string;
  ar: string;
  desc: string;
  icon: ReactNode;
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

const ICON = {
  box: (
    <>
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v8" />
    </>
  ),
  truck: (
    <>
      <path d="M3 6h12v11H3z" />
      <path d="M15 10h4l2 2v5h-6z" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17" cy="18" r="1.6" />
    </>
  ),
  factory: (
    <>
      <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M17 18h1" /><path d="M12 18h1" /><path d="M7 18h1" />
    </>
  ),
  wrench: (
    <>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </>
  ),
  flask: (
    <>
      <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2" />
      <path d="M8.5 2h7" /><path d="M7 16h10" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />
    </>
  ),
  chart: (
    <>
      <path d="M3 21h18" /><path d="M7 17v-6" /><path d="M12 17V7" /><path d="M17 17v-9" />
    </>
  ),
  atom: (
    <>
      <circle cx="12" cy="12" r="1" />
      <path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z" />
      <path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z" />
    </>
  ),
};

const MODULES: ModuleDef[] = [
  { access: 'orders', path: 'orders', en: 'Orders', ar: 'الطلبات', desc: 'Order entry & approvals', icon: ICON.box },
  { access: 'operation', path: 'operations', en: 'Operations', ar: 'التشغيل', desc: 'Fleet dispatch & tracking', icon: ICON.truck },
  { access: 'production', path: 'production', en: 'Production', ar: 'الإنتاج', desc: 'Batching & inventory', icon: ICON.factory },
  { access: 'workshop', path: 'workshop', en: 'Workshop', ar: 'الورشة', desc: 'Maintenance & fleet', icon: ICON.wrench },
  { access: 'mixing', path: 'mixing', en: 'Mixing & Quality', ar: 'المختبر والجودة', desc: 'QC samples & calibration', icon: ICON.flask },
  { access: 'schedule', path: 'schedule', en: 'Schedule', ar: 'الجدول', desc: 'Smart daily pouring', icon: ICON.calendar },
  { access: 'evaluation', path: 'evaluation', en: 'Evaluation', ar: 'التقييم', desc: 'Plant OEE & KPI', icon: ICON.chart },
  { access: 'rnd', path: 'rnd', en: 'R & D', ar: 'البحث والتطوير', desc: 'Innovation & training', icon: ICON.atom },
];

const DEFAULT_TRIPS: Trip[] = [
  { id: 1, plant: "PLANT-A", date: "2026-06-18", code: "m01", driver: "Ahmed Ali", qty: 10, pump: "p01", estTime: 40, stationArr: "08:00", stationDep: "08:10", siteArr: "08:50", siteDep: "09:30", siteName: "vally damam", projectName: "dammam 1", status: "COMPLETED" },
  { id: 2, plant: "PLANT-A", date: "2026-06-18", code: "m02", driver: "Driver-2", qty: 10, pump: "p01", estTime: 45, stationArr: "10:00", stationDep: "10:11", siteArr: "10:56", siteDep: "11:40", siteName: "00 (kk)", projectName: "00 (kk)", status: "COMPLETED" },
  { id: 3, plant: "PLANT-B", date: "2026-06-18", code: "m03", driver: "Saeed John", qty: 10, pump: "p02", estTime: 30, stationArr: "09:00", stationDep: "09:12", siteArr: "09:42", siteDep: "10:20", siteName: "Khobar Site", projectName: "Tower B", status: "COMPLETED" },
];

function ModuleButton({ m, onGo }: { m: ModuleDef; onGo: () => void }) {
  return (
    <button
      onClick={onGo}
      className="group relative flex flex-col items-start justify-between gap-2.5 min-h-[120px] lg:min-h-[132px] rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-3.5 lg:p-4 text-left transition-all duration-300 hover:-translate-y-1 hover:border-sky-400/70 hover:bg-white/[0.05] hover:shadow-[0_0_30px_rgba(56,189,248,0.35)] cursor-pointer"
    >
      <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center transition-colors duration-300 group-hover:border-sky-400/60 group-hover:bg-sky-400/10 group-hover:shadow-[0_0_16px_rgba(56,189,248,0.4)]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-slate-400 transition-colors duration-300 group-hover:text-sky-400">
          {m.icon}
        </svg>
      </div>
      <div className="w-full">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm lg:text-[15px] font-black text-white tracking-tight group-hover:text-sky-300 transition-colors duration-300">{m.en}</h3>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-slate-600 transition-all duration-300 group-hover:text-sky-400 group-hover:translate-x-0.5 shrink-0">
            <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
          </svg>
        </div>
        <p className="text-[11px] font-bold text-sky-400/90 mt-0.5" dir="rtl">{m.ar}</p>
        <p className="text-[10px] text-slate-500 mt-1 leading-snug">{m.desc}</p>
      </div>
    </button>
  );
}

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

  const inputCls = "w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-slate-100 text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] transition placeholder:text-slate-500";

  return (
    <div
      className="min-h-screen text-slate-200"
      style={{ background: "radial-gradient(ellipse 80% 40% at 50% -10%, rgba(56,189,248,0.13), transparent), #080C14" }}
    >
      {/* ===== LOGIN MODAL ===== */}
      {showLogin && (
        <div className="fixed inset-0 z-[100] bg-[#080C14]/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0B111E]/95 border border-white/10 rounded-2xl w-full max-w-xl p-8 shadow-[0_0_60px_rgba(56,189,248,0.12)] max-h-[95vh] overflow-y-auto">
            <div className="text-center mb-6">
              <div className="flex justify-center mb-4">
                <BrandLogo width={200} fill rounded="rounded-2xl" />
              </div>
              <h2 className="text-2xl font-black text-white mb-2">
                {tab === "login" ? "Welcome Back" : tab === "register" ? "Create Account" : "Verify Email"}
              </h2>
              <p className="text-sm text-slate-400">Technical Management Program for Concrete Plants</p>
              <p className="text-xs text-sky-400 mt-1 font-semibold">Design by Dr. Ahmad Abdo Alyan</p>
            </div>

            {tab === "register" && (
              <form onSubmit={handleRegister} className="space-y-3">
                <div className="bg-sky-500/10 border border-dashed border-sky-500/40 rounded-lg p-3 text-sky-300 text-xs text-center mb-3">
                  🆓 Free Trial Registration — All features unlocked<br />
                  💾 Each account gets a private 300 MB storage database (قاعدة بيانات خاصة 300 ميجا)<br />
                  <span className="text-sky-400/70">إذا احتجت قاعدة أكبر تواصل مع المبرمج بعد التسجيل</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col">
                    <label className="text-xs text-slate-400 font-semibold mb-1">Username *</label>
                    <input value={reg.username} onChange={o => setReg({ ...reg, username: o.target.value })} className={inputCls} />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs text-slate-400 font-semibold mb-1">Password *</label>
                    <input type="password" value={reg.password} onChange={o => setReg({ ...reg, password: o.target.value })} className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col">
                    <label className="text-xs text-slate-400 font-semibold mb-1">Country *</label>
                    <select value={reg.country} onChange={o => setReg({ ...reg, country: o.target.value, city: "" })} className={inputCls}>
                      {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs text-slate-400 font-semibold mb-1">City *</label>
                    <select value={reg.city} onChange={o => setReg({ ...reg, city: o.target.value })} className={inputCls}>
                      <option value="">Select City</option>
                      {(CITIES[reg.country] || []).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-slate-400 font-semibold mb-1">Plant / Company Name *</label>
                  <input value={reg.plantName} onChange={o => setReg({ ...reg, plantName: o.target.value })} placeholder="e.g. Al-Khaleej Concrete Plant" className={inputCls} />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-slate-400 font-semibold mb-1">Phone Number *</label>
                  <div className="flex gap-2">
                    <select value={reg.phonePrefix} onChange={o => setReg({ ...reg, phonePrefix: o.target.value })} className={`${inputCls} w-[35%]`}>
                      <option value="+20">+20 (EG)</option>
                      <option value="+966">+966 (KSA)</option>
                      <option value="+971">+971 (UAE)</option>
                      <option value="+965">+965 (KW)</option>
                      <option value="+974">+974 (QA)</option>
                    </select>
                    <input value={reg.phone} onChange={o => setReg({ ...reg, phone: o.target.value })} placeholder="1001006627" className={`${inputCls} flex-1`} />
                  </div>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-slate-400 font-semibold mb-1">Email *</label>
                  <input type="email" value={reg.email} onChange={o => setReg({ ...reg, email: o.target.value })} placeholder="example@email.com" className={inputCls} />
                </div>
                {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                <button type="submit" disabled={busy} className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-wait text-white font-bold py-3 rounded-lg text-sm transition shadow-[0_0_20px_rgba(56,189,248,0.3)]">
                  {busy ? "⏳ Sending Verification Code..." : "📧 Register & Send Verification Code"}
                </button>
                <p className="text-center text-sm text-slate-400 mt-3">
                  Already have an account? <span className="text-sky-400 cursor-pointer underline font-bold" onClick={() => { setTab('login'); setError(''); }}>Login</span>
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
                      <strong className="text-sky-300 text-sm">{reg.email}</strong>
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
                    <div className="animate-spin w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      Sending verification code to<br />
                      <strong className="text-sky-300">{reg.email}</strong>...
                    </p>
                  </div>
                )}
                <div className="flex flex-col">
                  <label className="text-xs text-slate-400 font-semibold mb-1">Verification Code</label>
                  <input value={verifyCode} onChange={o => setVerifyCode(o.target.value)} placeholder="Enter 6-digit code" className={`${inputCls} text-center text-lg tracking-widest`} />
                </div>
                {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                <button onClick={handleVerify} className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white font-bold py-3 rounded-lg transition">✅ Activate Account</button>
                <button
                  onClick={() => {
                    const u: UserSession = { ...reg, phone: reg.phonePrefix + reg.phone, status: "FREE_TRIAL" };
                    register(u).then(r => setSentState(r.emailSent));
                  }}
                  disabled={busy}
                  className="w-full bg-sky-500/10 hover:bg-sky-500/20 disabled:opacity-50 text-sky-300 font-bold py-2 rounded-lg text-sm transition border border-sky-500/30"
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
                  <input value={loginForm.username} onChange={o => setLoginForm({ ...loginForm, username: o.target.value })} className={inputCls} />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-slate-400 font-semibold mb-1">Password</label>
                  <input type="password" value={loginForm.password} onChange={o => setLoginForm({ ...loginForm, password: o.target.value })} className={inputCls} />
                </div>
                {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                <button type="submit" className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white font-bold py-3 rounded-lg transition shadow-[0_0_20px_rgba(56,189,248,0.3)]">🔓 Login</button>
                <button
                  type="button"
                  onClick={() => { loginAsGuest(); setShowLogin(false); }}
                  className="w-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 font-bold py-3 rounded-lg transition text-sm mt-2"
                >
                  👤 Continue as Guest
                </button>
                <p className="text-center text-sm text-slate-400 mt-3">
                  Don't have an account? <span className="text-sky-400 cursor-pointer underline font-bold" onClick={() => { setTab('register'); setError(''); }}>Register Free</span>
                </p>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ===== HEADER ===== */}
      <header className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-4 sticky top-0 z-10 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <BrandLogo width={60} rounded="rounded-xl" />
          <div>
            <h1 className="font-display text-lg font-black tracking-wide text-white">
              CONCRETE <span className="text-sky-400 drop-shadow-[0_0_10px_rgba(56,189,248,0.7)]">ERP</span>
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Fimto Soft — Technical Management Program · برنامج إدارة محطات الخرسانة</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <QuickJump />
          <LangSelector />
          {currentUser ? (
            <div className="flex items-center gap-2">
              <span className="bg-sky-500/10 text-sky-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-sky-500/30">
                🟢 {currentUser.plantName} (Free Trial)
              </span>
              {canManageAdmin() && (
                <button
                  onClick={() => navigate('/admin')}
                  className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-sky-400/60 hover:text-sky-300 transition-colors"
                >
                  Admin Panel
                </button>
              )}
              <button
                onClick={() => { logout(); navigate('/'); }}
                className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-red-400/60 hover:text-red-300 transition-colors"
              >
                Logout
              </button>
            </div>
          ) : (
            <span className="bg-white/[0.04] text-slate-400 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10">
              Guest Session (🔒 Restricted)
            </span>
          )}
        </div>
      </header>

      {/* ===== STORAGE QUOTA BANNER ===== */}
      <div className="px-6 pt-4 max-w-[1200px] mx-auto w-full">
        <QuotaBanner />
      </div>

      {/* ===== MAIN ===== */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 lg:py-10">

        {/* Hero — welcome statement */}
        <div className="relative text-center mb-8 lg:mb-12">
          <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse 55% 90% at 50% 0%, rgba(56,189,248,0.12), transparent)" }} />
          <p className="relative text-[10px] sm:text-xs tracking-[0.5em] text-sky-400/80 uppercase mb-3 font-display">Fimto Soft · Technical Management Program</p>
          <h2 className="relative text-4xl sm:text-5xl lg:text-6xl font-display font-black tracking-tight uppercase bg-gradient-to-r from-sky-400 via-cyan-300 to-sky-400 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(56,189,248,0.35)]">
            Concrete <span className="text-white/90">ERP</span>
          </h2>
          <p className="relative text-sm sm:text-base text-slate-300 mt-4 max-w-2xl mx-auto leading-relaxed">
            برنامج إدارة محطات الخرسانة الجاهزة — لوحة تحكم ذكية تجمع كل الأقسام في مشهد واحد متكامل
          </p>
        </div>

        {/* ===== Center Anchor Layout: live modules flank the hero image symmetrically ===== */}
        <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-8">
          {/* LEFT cluster — 4 modules */}
          <div className="order-2 lg:order-1 w-full lg:flex-1 grid grid-cols-2 lg:grid-cols-1 gap-3 lg:gap-4 content-center">
            {MODULES.slice(0, 4).filter(m => canAccess(m.access)).map(m => (
              <ModuleButton key={m.path} m={m} onGo={() => go(m.path)} />
            ))}
          </div>

          {/* CENTER — hero image */}
          <div className="order-1 lg:order-2 w-full lg:w-auto lg:shrink-0 flex justify-center px-1">
            <div className="relative w-full max-w-[640px] lg:max-w-[720px]">
              <div className="pointer-events-none absolute inset-0 -z-10 blur-3xl" style={{ background: "radial-gradient(ellipse 60% 60% at 50% 50%, rgba(56,189,248,0.22), transparent 70%)" }} />
              <img
                src={mainPhoto}
                alt="Concrete ERP command center"
                className="w-full h-auto object-contain rounded-2xl border border-white/10 shadow-[0_0_60px_rgba(56,189,248,0.12)]"
              />
            </div>
          </div>

          {/* RIGHT cluster — 4 modules */}
          <div className="order-3 w-full lg:flex-1 grid grid-cols-2 lg:grid-cols-1 gap-3 lg:gap-4 content-center">
            {MODULES.slice(4, 8).filter(m => canAccess(m.access)).map(m => (
              <ModuleButton key={m.path} m={m} onGo={() => go(m.path)} />
            ))}
          </div>
        </div>
      </div>

      {/* ===== RECENT TRIPS ===== */}
      <div className="max-w-[1200px] mx-auto px-6 pb-10">
        <div className="rounded-2xl border border-white/10 bg-[#0B111E]/60 backdrop-blur-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black text-white tracking-tight">🚛 Recent Concrete Trips</h2>
            <span className="text-[10px] uppercase tracking-widest text-slate-500 border border-white/10 px-2 py-1 rounded">Live Overview</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recent.map(t => {
              const p = plantMins(t.stationArr, t.stationDep);
              const je = diffMin(t.stationDep, t.siteArr);
              const Me = je > 120;
              return (
                <div key={t.id} className={`rounded-xl border bg-white/[0.03] backdrop-blur-xl p-4 ${Me ? "border-red-500/50 animate-pulse" : "border-white/10"}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-sky-500/10 text-sky-300 px-2 py-0.5 rounded border border-sky-500/20">{t.status}</span>
                    <span className="text-[11px] text-slate-500">{t.date}</span>
                  </div>
                  <h3 className="text-lg font-black text-white">{t.code}</h3>
                  <div className="text-xs text-slate-400 mt-2 space-y-1">
                    <p><span className="text-slate-500">Plant:</span> <strong className="text-slate-300">{t.plant}</strong></p>
                    <p><span className="text-slate-500">Driver:</span> {t.driver}</p>
                    <p><span className="text-slate-500">Load:</span> {t.qty} m³ | Pump: {t.pump}</p>
                    <p><span className="text-slate-500">Project:</span> {t.siteName} ({t.projectName})</p>
                    <p className={p > 12 ? "text-red-400 font-bold" : "text-emerald-400 font-bold"}>
                      🏭 Plant: {p > 12 ? `Delay ${p - 12}m` : `On Time (${p}m)`}
                    </p>
                    <p className={Me ? "text-red-400 font-extrabold animate-pulse" : je > Number(t.estTime) ? "text-red-400 font-bold" : "text-emerald-400 font-bold"}>
                      🚚 Transit: {Me ? `🚨 CRITICAL ${je}m (>2hrs)` : je > Number(t.estTime) ? `Delay ${je - Number(t.estTime)}m` : `On Time (${je}m)`}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/10 text-[10px] text-slate-500">
                    <div>Arr Plant: <span className="text-slate-200">{to12h(t.stationArr)}</span></div>
                    <div>Dep Plant: <span className="text-slate-200">{to12h(t.stationDep)}</span></div>
                    <div>Arr Site: <span className="text-slate-200">{to12h(t.siteArr)}</span></div>
                    <div>Dep Site: <span className="text-slate-200">{to12h(t.siteDep)}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== FOOTER ===== */}
      <div className="max-w-[1200px] mx-auto px-6 text-center text-xs text-slate-500 border-t border-white/10 pt-6 pb-10 space-y-2">
        <p className="text-sky-400 font-bold text-sm">🏗️ Technical Management Program — Enterprise ERP | Version 1.6</p>
        <p className="text-slate-300 font-semibold text-sm">Designed & Developed by Dr. Ahmed Abdou Alyan</p>
        <div className="flex gap-4 flex-wrap justify-center text-xs">
          <span>📞 <b className="text-slate-400">EG:</b> <a href="tel:0201001006627" className="text-sky-400 font-semibold">0201001006627</a></span>
          <span>📞 <b className="text-slate-400">KSA:</b> <a href="tel:+996500439617" className="text-sky-400 font-semibold">+996500439617</a></span>
          <span>📧 <b className="text-slate-400">Email:</b> <a href="mailto:ahmed@concrete-erp.com" className="text-sky-400 font-semibold">ahmed@concrete-erp.com</a></span>
        </div>
      </div>
    </div>
  );
}
