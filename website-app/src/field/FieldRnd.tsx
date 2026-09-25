import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { loadRnDData, saveRnDData } from "../firebase/firestore";

/**
 * Field R&D (desktop-first research hub).
 * Projects / innovations / trainings from the same `rndData` store as the
 * website ResearchDevelopment page — list + quick add. Read/write.
 */
interface TabDef {
  key: "projects" | "innovations" | "trainings";
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { key: "projects", label: "المشاريع", icon: "🔬" },
  { key: "innovations", label: "الأفكار", icon: "💡" },
  { key: "trainings", label: "التدريب", icon: "🎓" },
];

export default function FieldRnd() {
  const { currentUser } = useAuth();
  const [tab, setTab] = useState<TabDef["key"]>("projects");
  const [data, setData] = useState<{ projects: any[]; innovations: any[]; trainings: any[] }>({
    projects: [],
    innovations: [],
    trainings: [],
  });
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    if (!currentUser) return;
    try {
      const d = await loadRnDData(currentUser.username);
      if (d) {
        setData({
          projects: Array.isArray(d.projects) ? d.projects : [],
          innovations: Array.isArray(d.innovations) ? d.innovations : [],
          trainings: Array.isArray(d.trainings) ? d.trainings : [],
        });
      }
    } catch {
      /* offline — keep last */
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.username]);

  const persist = async (next: typeof data) => {
    if (!currentUser) return;
    setData(next);
    try {
      await saveRnDData(currentUser.username, next);
    } catch {
      /* offline — local copy kept */
    }
  };

  const addItem = async () => {
    if (!title.trim() || !currentUser) return;
    setSaving(true);
    const item = {
      id: Date.now(),
      title: title.trim(),
      status: tab === "projects" ? "planning" : tab === "innovations" ? "idea" : "planned",
      date: new Date().toISOString().slice(0, 10),
    };
    await persist({ ...data, [tab]: [item, ...data[tab]] });
    setTitle("");
    setSaving(false);
  };

  const removeItem = async (id: number) => {
    await persist({ ...data, [tab]: data[tab].filter((x: any) => x.id !== id) });
  };

  const list = data[tab];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-black text-white">🧪 البحث والتطوير</h2>
        <Link to="/field" className="text-xs text-slate-400 hover:text-white border border-white/10 rounded-lg px-3 py-2">→ الميدان</Link>
      </div>
      <div className="flex gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black border transition-colors ${
              tab === t.key
                ? "bg-sky-500 text-white border-sky-500"
                : "bg-white/[0.04] text-slate-300 border-white/10"
            }`}
          >
            {t.icon} {t.label} ({data[t.key].length})
          </button>
        ))}
      </div>
      <div className="flex gap-2 mb-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
          placeholder={tab === "projects" ? "مشروع جديد..." : tab === "innovations" ? "فكرة جديدة..." : "تدريب جديد..."}
          className="flex-1 px-3 py-2.5 bg-white/[0.04] border border-white/10 text-white rounded-xl text-sm focus:outline-none focus:border-sky-400/70 placeholder-slate-500"
        />
        <button
          onClick={addItem}
          disabled={saving || !title.trim()}
          className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-sm font-black px-5 rounded-xl"
        >
          إضافة
        </button>
      </div>
      <div className="space-y-2">
        {list.map((x: any) => (
          <div key={x.id} className="border border-white/10 bg-white/[0.03] rounded-xl px-4 py-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-white">{x.title}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{x.status} · {x.date || ""}</p>
            </div>
            <button onClick={() => removeItem(x.id)} className="text-slate-500 hover:text-red-400 text-lg px-2" aria-label="حذف">×</button>
          </div>
        ))}
        {list.length === 0 && <p className="text-xs text-slate-500 text-center py-8">لا عناصر بعد — أضف أول واحد بالأعلى</p>}
      </div>
    </div>
  );
}
