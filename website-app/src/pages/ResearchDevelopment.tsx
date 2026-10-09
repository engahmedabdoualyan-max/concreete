import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loadRnDData, saveRnDData } from '../firebase/firestore';
import { api } from '../api/client';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';
import { useResearchDevelopmentDict } from '../i18n/researchDevelopmentDict';

interface ResearchProject {
  id: number | string;
  title: string;
  category: 'concrete' | 'sustainability' | 'automation' | 'materials';
  status: 'planning' | 'in_progress' | 'completed';
  startDate: string;
  endDate: string;
  budget: number;
  team: string;
  description: string;
  results: string;
}

interface Innovation {
  id: number;
  title: string;
  type: 'process' | 'product' | 'technology';
  impact: 'high' | 'medium' | 'low';
  status: 'idea' | 'development' | 'implemented';
  date: string;
  description: string;
}

interface Training {
  id: number;
  title: string;
  category: 'technical' | 'safety' | 'quality' | 'management';
  target: string;
  duration: string;
  date: string;
  status: 'planned' | 'completed';
}

export default function ResearchDevelopment() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const L = useResearchDevelopmentDict();
  const [tab, setTab] = useState<'research' | 'innovation' | 'training'>('research');
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);

  // Data states - starts empty, loaded from Firebase
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [innovations, setInnovations] = useState<Innovation[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  // 'api' once projects come from the central API; Firestore stays as fallback cache
  const [plansSource, setPlansSource] = useState<'api' | 'local'>('local');

  // ============ Central API mapping (GET/POST/PUT/DELETE /api/rnd/plans) ============
  interface BackendPlan {
    id: string;
    title: string;
    description?: string | null;
    category?: string | null;
    status: string;
    startDate: string;
    endDate: string;
    budgetSar?: number | null;
  }
  const PLAN_CATEGORY_TO_API: Record<ResearchProject['category'], string> = {
    concrete: 'PRODUCTION',
    sustainability: 'QUALITY',
    automation: 'TECHNOLOGY',
    materials: 'PROCESS',
  };
  const mapPlanToProject = (p: BackendPlan): ResearchProject => ({
    id: p.id,
    title: p.title,
    category: p.category === 'QUALITY' ? 'sustainability'
      : p.category === 'TECHNOLOGY' ? 'automation'
      : p.category === 'PROCESS' ? 'materials' : 'concrete',
    status: p.status === 'IN_PROGRESS' || p.status === 'APPROVED' ? 'in_progress'
      : p.status === 'COMPLETED' ? 'completed' : 'planning',
    startDate: (p.startDate || '').slice(0, 10),
    endDate: (p.endDate || '').slice(0, 10),
    budget: p.budgetSar ?? 0,
    team: '',
    description: p.description ?? '',
    results: '',
  });

  // Load: central API first, Firestore fallback (also fills innovations/trainings,
  // which have no backend endpoints and stay Firestore-local)
  useEffect(() => {
    if (!currentUser || loadedRef.current) return;
    loadedRef.current = true;
    let apiPlans: ResearchProject[] | null = null;
    api.get<{ plans: BackendPlan[] }>('/api/rnd/plans')
      .then(d => {
        if (Array.isArray(d.plans)) {
          apiPlans = d.plans.map(mapPlanToProject);
          setProjects(apiPlans);
          setPlansSource('api');
        }
      })
      .catch(() => { /* offline — Firestore fallback below */ })
      .finally(() => {
        loadRnDData(currentUser.username).then(d => {
          if (d && typeof d === 'object') {
            if (!apiPlans && Array.isArray(d.projects)) setProjects(d.projects);
            if (Array.isArray(d.innovations)) setInnovations(d.innovations);
            if (Array.isArray(d.trainings)) setTrainings(d.trainings);
          }
          setLoaded(true);
        }).catch(() => setLoaded(true));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Save to Firebase on changes
  useEffect(() => {
    if (!loaded || !currentUser) return;
    saveRnDData(currentUser.username, { projects, innovations, trainings }).catch(() => {});
  }, [projects, innovations, trainings, loaded]);

  // Forms
  const [projectForm, setProjectForm] = useState({ title: '', category: 'concrete' as ResearchProject['category'], status: 'planning' as ResearchProject['status'], startDate: '', endDate: '', budget: '', team: '', description: '' });
  const [innovationForm, setInnovationForm] = useState({ title: '', type: 'process' as Innovation['type'], impact: 'medium' as Innovation['impact'], status: 'idea' as Innovation['status'], date: '', description: '' });
  const [trainingForm, setTrainingForm] = useState({ title: '', category: 'technical' as Training['category'], target: '', duration: '', date: '', status: 'planned' as Training['status'] });

  // Functions
  const addProject = () => {
    if (!projectForm.title) return;
    const today = new Date().toISOString().split('T')[0];
    const fallback: ResearchProject = { id: Date.now(), ...projectForm, budget: parseFloat(projectForm.budget) || 0, results: '' };
    // POST requires startDate/endDate; default to today. Backend has no team
    // field, so it is appended to the description to avoid data loss.
    const payload = {
      title: projectForm.title,
      description: [projectForm.description, projectForm.team ? `Team: ${projectForm.team}` : ''].filter(Boolean).join('\n') || undefined,
      category: PLAN_CATEGORY_TO_API[projectForm.category],
      startDate: projectForm.startDate || today,
      endDate: projectForm.endDate || projectForm.startDate || today,
      budgetSar: Math.max(0, Math.round(parseFloat(projectForm.budget) || 0)),
    };
    api.post<BackendPlan>('/api/rnd/plans', payload)
      .then(p => setProjects(prev => [...prev, mapPlanToProject(p)]))
      .catch(() => setProjects(prev => [...prev, fallback]));
    setProjectForm({ title: '', category: 'concrete', status: 'planning', startDate: '', endDate: '', budget: '', team: '', description: '' });
  };

  const addInnovation = () => {
    if (!innovationForm.title) return;
    setInnovations([...innovations, { id: Date.now(), ...innovationForm }]);
    setInnovationForm({ title: '', type: 'process', impact: 'medium', status: 'idea', date: '', description: '' });
  };

  const addTraining = () => {
    if (!trainingForm.title) return;
    setTrainings([...trainings, { id: Date.now(), ...trainingForm }]);
    setTrainingForm({ title: '', category: 'technical', target: '', duration: '', date: '', status: 'planned' });
  };

  // Status advance via PUT /api/rnd/plans/[planId] (DRAFT→IN_PROGRESS→COMPLETED;
  // finance-gate states live on other endpoints and are intentionally untouched)
  const changeProjectStatus = (p: ResearchProject, next: ResearchProject['status']) => {
    setProjects(prev => prev.map(x => (x.id === p.id ? { ...x, status: next } : x)));
    if (typeof p.id === 'string' && plansSource === 'api') {
      const backendStatus = next === 'in_progress' ? 'IN_PROGRESS' : next === 'completed' ? 'COMPLETED' : 'DRAFT';
      api.put(`/api/rnd/plans/${p.id}`, { status: backendStatus }).catch(() => {});
    }
  };

  const deleteProject = (id: number | string) => {
    if (!confirm('Delete?')) return;
    setProjects(projects.filter(p => p.id !== id));
    // Backend deletes DRAFT plans only; other states 409 and stay server-side
    if (typeof id === 'string' && plansSource === 'api') api.del(`/api/rnd/plans/${id}`).catch(() => {});
  };
  const deleteInnovation = (id: number) => { if (confirm('Delete?')) setInnovations(innovations.filter(i => i.id !== id)); };
  const deleteTraining = (id: number) => { if (confirm('Delete?')) setTrainings(trainings.filter(t => t.id !== id)); };

  if (!currentUser) return <div className="min-h-screen bg-[#0B111E] flex items-center justify-center"><div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 Access Denied</p><Link to="/" className="text-sky-400 underline">{L('rdBackLogin')}</Link></div></div>;

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      {/* Header */}
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2 py-1 rounded hover:text-white">← Dashboard</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-bold text-white">🔬 Research & Development</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
          <button onClick={() => { logout(); navigate('/'); }} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-red-400/60 hover:text-red-300 transition-colors">{L('logout')}</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-2 p-4 max-w-6xl mx-auto">
        {[
          { id: 'research', label: '📊 Research Projects', icon: '📊' },
          { id: 'innovation', label: '💡 Innovations', icon: '💡' },
          { id: 'training', label: '🎓 Training', icon: '🎓' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} className={`py-2 px-4 rounded-lg font-bold text-sm transition ${tab === t.id ? 'bg-sky-500 text-white' : 'bg-white/[0.03] text-slate-400 border border-white/10 hover:text-sky-300 hover:bg-white/[0.06]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <main className="max-w-6xl mx-auto p-6">
        {/* Research Projects */}
        {tab === 'research' && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white/[0.04] border-l-4 border-sky-500 rounded-lg p-4 backdrop-blur-xl">
                <p className="text-xs text-slate-400">{L('rdProjects')}</p>
                <p className="text-2xl font-bold text-white">{projects.length}</p>
              </div>
              <div className="bg-white/[0.04] border-l-4 border-emerald-500 rounded-lg p-4 backdrop-blur-xl">
                <p className="text-xs text-slate-400">{L('rdInProg')}</p>
                <p className="text-2xl font-bold text-white">{projects.filter(p => p.status === 'in_progress').length}</p>
              </div>
              <div className="bg-white/[0.04] border-l-4 border-sky-500 rounded-lg p-4 backdrop-blur-xl">
                <p className="text-xs text-slate-400">{L('rdBudget')}</p>
                <p className="text-2xl font-bold text-white">${projects.reduce((s, p) => s + p.budget, 0).toLocaleString()}</p>
              </div>
              <div className="bg-white/[0.04] border-l-4 border-yellow-500 rounded-lg p-4 backdrop-blur-xl">
                <p className="text-xs text-slate-400">{L('rdCompleted')}</p>
                <p className="text-2xl font-bold text-white">{projects.filter(p => p.status === 'completed').length}</p>
              </div>
            </div>

            {/* Add Project */}
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-bold text-white mb-4">➕ Add Research Project</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input value={projectForm.title} onChange={e => setProjectForm({ ...projectForm, title: e.target.value })} placeholder="Project Title" className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" />
                <select value={projectForm.category} onChange={e => setProjectForm({ ...projectForm, category: e.target.value as any })} className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                  <option value="concrete">🏗️ Concrete Technology</option>
                  <option value="sustainability">🌱 Sustainability</option>
                  <option value="automation">🤖 Automation</option>
                  <option value="materials">🧪 Materials Science</option>
                </select>
                <input type="date" value={projectForm.startDate} onChange={e => setProjectForm({ ...projectForm, startDate: e.target.value })} className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm [color-scheme:dark]" />
                <input type="date" value={projectForm.endDate} onChange={e => setProjectForm({ ...projectForm, endDate: e.target.value })} className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm [color-scheme:dark]" />
                <input type="number" value={projectForm.budget} onChange={e => setProjectForm({ ...projectForm, budget: e.target.value })} placeholder="Budget ($)" className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" />
                <input value={projectForm.team} onChange={e => setProjectForm({ ...projectForm, team: e.target.value })} placeholder="Team Members" className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" />
                <textarea value={projectForm.description} onChange={e => setProjectForm({ ...projectForm, description: e.target.value })} placeholder="Description" rows={3} className="md:col-span-2 bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm resize-none" />
              </div>
              <button onClick={addProject} className="mt-4 w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 rounded-lg shadow-[0_0_25px_rgba(56,189,248,0.4)]">➕ Add Project</button>
            </div>

            {/* Projects List */}
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-bold text-white mb-4">📊 Research Projects ({projects.length})</h3>
              <div className="space-y-4">
                {projects.map(p => (
                  <div key={p.id} className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-bold text-white">{p.title}</h4>
                        <p className="text-xs text-slate-400">{p.team}</p>
                      </div>
                      <div className="flex gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${p.status === 'in_progress' ? 'bg-sky-500/20 text-sky-400' : p.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{p.status}</span>
                        {typeof p.id === 'string' && (
                          <select
                            value={p.status}
                            onChange={e => changeProjectStatus(p, e.target.value as ResearchProject['status'])}
                            title="Change status (syncs to server)"
                            className="bg-white/[0.04] border border-white/10 rounded text-[10px] px-1 py-0.5 text-slate-300"
                          >
                            <option value="planning">planning</option>
                            <option value="in_progress">in_progress</option>
                            <option value="completed">completed</option>
                          </select>
                        )}
                        <button onClick={() => deleteProject(p.id)} className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded hover:bg-red-500/30">{L('rdDel')}</button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-300 mb-2">{p.description}</p>
                    <div className="flex gap-4 text-xs text-slate-400">
                      <span>📅 {p.startDate} → {p.endDate}</span>
                      <span>💰 ${p.budget.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Innovations */}
        {tab === 'innovation' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-white/[0.04] border-l-4 border-yellow-500 rounded-lg p-4 backdrop-blur-xl">
                <p className="text-xs text-slate-400">{L('rdIdeas')}</p>
                <p className="text-2xl font-bold text-white">{innovations.length}</p>
              </div>
              <div className="bg-white/[0.04] border-l-4 border-emerald-500 rounded-lg p-4 backdrop-blur-xl">
                <p className="text-xs text-slate-400">{L('rdImpl')}</p>
                <p className="text-2xl font-bold text-white">{innovations.filter(i => i.status === 'implemented').length}</p>
              </div>
              <div className="bg-white/[0.04] border-l-4 border-sky-500 rounded-lg p-4 backdrop-blur-xl">
                <p className="text-xs text-slate-400">{L('rdHigh')}</p>
                <p className="text-2xl font-bold text-white">{innovations.filter(i => i.impact === 'high').length}</p>
              </div>
            </div>

            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-bold text-white mb-4">💡 Add Innovation</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input value={innovationForm.title} onChange={e => setInnovationForm({ ...innovationForm, title: e.target.value })} placeholder="Innovation Title" className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" />
                <select value={innovationForm.type} onChange={e => setInnovationForm({ ...innovationForm, type: e.target.value as any })} className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                  <option value="process">⚙️ Process</option>
                  <option value="product">📦 Product</option>
                  <option value="technology">💻 Technology</option>
                </select>
                <select value={innovationForm.impact} onChange={e => setInnovationForm({ ...innovationForm, impact: e.target.value as any })} className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                  <option value="high">🔴 High Impact</option>
                  <option value="medium">🟡 Medium Impact</option>
                  <option value="low">🟢 Low Impact</option>
                </select>
                <input type="date" value={innovationForm.date} onChange={e => setInnovationForm({ ...innovationForm, date: e.target.value })} className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm [color-scheme:dark]" />
                <textarea value={innovationForm.description} onChange={e => setInnovationForm({ ...innovationForm, description: e.target.value })} placeholder="Description" rows={2} className="md:col-span-2 bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm resize-none" />
              </div>
              <button onClick={addInnovation} className="mt-4 w-full bg-amber-500 hover:bg-amber-400 text-white font-bold py-3 rounded-lg shadow-[0_0_25px_rgba(251,191,36,0.35)]">💡 Add Innovation</button>
            </div>

            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-bold text-white mb-4">💡 Innovations ({innovations.length})</h3>
              <div className="space-y-3">
                {innovations.map(i => (
                  <div key={i.id} className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-white">{i.title}</h4>
                      <div className="flex gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${i.impact === 'high' ? 'bg-red-500/20 text-red-400' : i.impact === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{i.impact}</span>
                        <button onClick={() => deleteInnovation(i.id)} className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded hover:bg-red-500/30">{L('rdDel')}</button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-300 mb-2">{i.description}</p>
                    <div className="flex gap-4 text-xs text-slate-400">
                      <span>📅 {i.date}</span>
                      <span>{i.type}</span>
                      <span className={`px-2 py-0.5 rounded ${i.status === 'implemented' ? 'bg-emerald-500/20 text-emerald-400' : i.status === 'development' ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-500/20 text-slate-400'}`}>{i.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Training */}
        {tab === 'training' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-white/[0.04] border-l-4 border-sky-500 rounded-lg p-4 backdrop-blur-xl">
                <p className="text-xs text-slate-400">{L('rdTrainings')}</p>
                <p className="text-2xl font-bold text-white">{trainings.length}</p>
              </div>
              <div className="bg-white/[0.04] border-l-4 border-emerald-500 rounded-lg p-4 backdrop-blur-xl">
                <p className="text-xs text-slate-400">{L('rdCompleted')}</p>
                <p className="text-2xl font-bold text-white">{trainings.filter(t => t.status === 'completed').length}</p>
              </div>
              <div className="bg-white/[0.04] border-l-4 border-yellow-500 rounded-lg p-4 backdrop-blur-xl">
                <p className="text-xs text-slate-400">{L('rdPlanned')}</p>
                <p className="text-2xl font-bold text-white">{trainings.filter(t => t.status === 'planned').length}</p>
              </div>
            </div>

            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-bold text-white mb-4">🎓 Add Training</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input value={trainingForm.title} onChange={e => setTrainingForm({ ...trainingForm, title: e.target.value })} placeholder="Training Title" className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" />
                <select value={trainingForm.category} onChange={e => setTrainingForm({ ...trainingForm, category: e.target.value as any })} className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                  <option value="technical">🔧 Technical</option>
                  <option value="safety">⛑️ Safety</option>
                  <option value="quality">✅ Quality</option>
                  <option value="management">📊 Management</option>
                </select>
                <input value={trainingForm.target} onChange={e => setTrainingForm({ ...trainingForm, target: e.target.value })} placeholder="Target Audience" className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" />
                <input value={trainingForm.duration} onChange={e => setTrainingForm({ ...trainingForm, duration: e.target.value })} placeholder="Duration" className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" />
                <input type="date" value={trainingForm.date} onChange={e => setTrainingForm({ ...trainingForm, date: e.target.value })} className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm [color-scheme:dark]" />
                <select value={trainingForm.status} onChange={e => setTrainingForm({ ...trainingForm, status: e.target.value as any })} className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                  <option value="planned">📅 Planned</option>
                  <option value="completed">✅ Completed</option>
                </select>
              </div>
              <button onClick={addTraining} className="mt-4 w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 rounded-lg shadow-[0_0_25px_rgba(56,189,248,0.4)]">🎓 Add Training</button>
            </div>

            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-bold text-white mb-4">🎓 Trainings ({trainings.length})</h3>
              <div className="space-y-3">
                {trainings.map(t => (
                  <div key={t.id} className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-white">{t.title}</h4>
                      <div className="flex gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${t.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{t.status}</span>
                        <button onClick={() => deleteTraining(t.id)} className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded hover:bg-red-500/30">{L('rdDel')}</button>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs text-slate-400">
                      <span>📅 {t.date}</span>
                      <span>👥 {t.target}</span>
                      <span>⏱️ {t.duration}</span>
                      <span>{t.category}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
