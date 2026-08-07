import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';

interface ResearchProject {
  id: number;
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
  const { currentUser } = useAuth();
  const [tab, setTab] = useState<'research' | 'innovation' | 'training'>('research');

  // Data states
  const [projects, setProjects] = useState<ResearchProject[]>([
    { id: 1, title: 'خرسانة صديقة للبيئة', category: 'sustainability', status: 'in_progress', startDate: '2026-01-01', endDate: '2026-06-30', budget: 50000, team: 'د. أحمد، م. محمد', description: 'تطوير خرسانة باستخدام مواد معاد تدويرها', results: '' },
    { id: 2, title: 'أتمتة محطة الخلط', category: 'automation', status: 'planning', startDate: '2026-03-01', endDate: '2026-12-31', budget: 100000, team: 'فريق IT', description: 'نظام تحكم آلي كامل للمحطة', results: '' },
  ]);
  const [innovations, setInnovations] = useState<Innovation[]>([
    { id: 1, title: 'نظام تتبع ذكي للشاحنات', type: 'technology', impact: 'high', status: 'implemented', date: '2026-01-15', description: 'نظام GPS متقدم مع تحليل البيانات' },
  ]);
  const [trainings, setTrainings] = useState<Training[]>([
    { id: 1, title: 'اختبارات الجودة المتقدمة', category: 'quality', target: 'فريق المعمل', duration: '3 أيام', date: '2026-02-15', status: 'completed' },
  ]);

  // Forms
  const [projectForm, setProjectForm] = useState({ title: '', category: 'concrete' as ResearchProject['category'], status: 'planning' as ResearchProject['status'], startDate: '', endDate: '', budget: '', team: '', description: '' });
  const [innovationForm, setInnovationForm] = useState({ title: '', type: 'process' as Innovation['type'], impact: 'medium' as Innovation['impact'], status: 'idea' as Innovation['status'], date: '', description: '' });
  const [trainingForm, setTrainingForm] = useState({ title: '', category: 'technical' as Training['category'], target: '', duration: '', date: '', status: 'planned' as Training['status'] });

  // Functions
  const addProject = () => {
    if (!projectForm.title) return;
    setProjects([...projects, { id: Date.now(), ...projectForm, budget: parseFloat(projectForm.budget) || 0, results: '' }]);
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

  const deleteProject = (id: number) => { if (confirm('Delete?')) setProjects(projects.filter(p => p.id !== id)); };
  const deleteInnovation = (id: number) => { if (confirm('Delete?')) setInnovations(innovations.filter(i => i.id !== id)); };
  const deleteTraining = (id: number) => { if (confirm('Delete?')) setTrainings(trainings.filter(t => t.id !== id)); };

  if (!currentUser) return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center"><div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 Access Denied</p><Link to="/" className="text-blue-400 underline">Back to Login</Link></div></div>;

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f1f5f9]">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#0f1729] to-[#1a2332] border-b border-[#2a3a5c] px-6 py-2.5 flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-[#2a3a5c] px-2 py-1 rounded hover:text-white">← Dashboard</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-bold text-white">🔬 Research & Development</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-2 p-4 max-w-6xl mx-auto">
        {[
          { id: 'research', label: '📊 Research Projects', icon: '📊' },
          { id: 'innovation', label: '💡 Innovations', icon: '💡' },
          { id: 'training', label: '🎓 Training', icon: '🎓' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} className={`py-2 px-4 rounded-lg font-bold text-sm transition ${tab === t.id ? 'bg-purple-600 text-white' : 'bg-[#1e293b] text-slate-400 border border-[#334155] hover:bg-purple-600/30'}`}>
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
              <div className="bg-[#1e293b] border-l-4 border-blue-500 rounded-lg p-4">
                <p className="text-xs text-slate-400">Total Projects</p>
                <p className="text-2xl font-bold text-white">{projects.length}</p>
              </div>
              <div className="bg-[#1e293b] border-l-4 border-emerald-500 rounded-lg p-4">
                <p className="text-xs text-slate-400">In Progress</p>
                <p className="text-2xl font-bold text-white">{projects.filter(p => p.status === 'in_progress').length}</p>
              </div>
              <div className="bg-[#1e293b] border-l-4 border-purple-500 rounded-lg p-4">
                <p className="text-xs text-slate-400">Total Budget</p>
                <p className="text-2xl font-bold text-white">${projects.reduce((s, p) => s + p.budget, 0).toLocaleString()}</p>
              </div>
              <div className="bg-[#1e293b] border-l-4 border-yellow-500 rounded-lg p-4">
                <p className="text-xs text-slate-400">Completed</p>
                <p className="text-2xl font-bold text-white">{projects.filter(p => p.status === 'completed').length}</p>
              </div>
            </div>

            {/* Add Project */}
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">➕ Add Research Project</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input value={projectForm.title} onChange={e => setProjectForm({ ...projectForm, title: e.target.value })} placeholder="Project Title" className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" />
                <select value={projectForm.category} onChange={e => setProjectForm({ ...projectForm, category: e.target.value as any })} className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm">
                  <option value="concrete">🏗️ Concrete Technology</option>
                  <option value="sustainability">🌱 Sustainability</option>
                  <option value="automation">🤖 Automation</option>
                  <option value="materials">🧪 Materials Science</option>
                </select>
                <input type="date" value={projectForm.startDate} onChange={e => setProjectForm({ ...projectForm, startDate: e.target.value })} className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm [color-scheme:dark]" />
                <input type="date" value={projectForm.endDate} onChange={e => setProjectForm({ ...projectForm, endDate: e.target.value })} className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm [color-scheme:dark]" />
                <input type="number" value={projectForm.budget} onChange={e => setProjectForm({ ...projectForm, budget: e.target.value })} placeholder="Budget ($)" className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" />
                <input value={projectForm.team} onChange={e => setProjectForm({ ...projectForm, team: e.target.value })} placeholder="Team Members" className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" />
                <textarea value={projectForm.description} onChange={e => setProjectForm({ ...projectForm, description: e.target.value })} placeholder="Description" rows={3} className="md:col-span-2 bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm resize-none" />
              </div>
              <button onClick={addProject} className="mt-4 w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg">➕ Add Project</button>
            </div>

            {/* Projects List */}
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">📊 Research Projects ({projects.length})</h3>
              <div className="space-y-4">
                {projects.map(p => (
                  <div key={p.id} className="bg-[#0f172a] border border-[#334155] rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-bold text-white">{p.title}</h4>
                        <p className="text-xs text-slate-400">{p.team}</p>
                      </div>
                      <div className="flex gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${p.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' : p.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{p.status}</span>
                        <button onClick={() => deleteProject(p.id)} className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded">Del</button>
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
              <div className="bg-[#1e293b] border-l-4 border-yellow-500 rounded-lg p-4">
                <p className="text-xs text-slate-400">Total Ideas</p>
                <p className="text-2xl font-bold text-white">{innovations.length}</p>
              </div>
              <div className="bg-[#1e293b] border-l-4 border-emerald-500 rounded-lg p-4">
                <p className="text-xs text-slate-400">Implemented</p>
                <p className="text-2xl font-bold text-white">{innovations.filter(i => i.status === 'implemented').length}</p>
              </div>
              <div className="bg-[#1e293b] border-l-4 border-blue-500 rounded-lg p-4">
                <p className="text-xs text-slate-400">High Impact</p>
                <p className="text-2xl font-bold text-white">{innovations.filter(i => i.impact === 'high').length}</p>
              </div>
            </div>

            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">💡 Add Innovation</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input value={innovationForm.title} onChange={e => setInnovationForm({ ...innovationForm, title: e.target.value })} placeholder="Innovation Title" className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" />
                <select value={innovationForm.type} onChange={e => setInnovationForm({ ...innovationForm, type: e.target.value as any })} className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm">
                  <option value="process">⚙️ Process</option>
                  <option value="product">📦 Product</option>
                  <option value="technology">💻 Technology</option>
                </select>
                <select value={innovationForm.impact} onChange={e => setInnovationForm({ ...innovationForm, impact: e.target.value as any })} className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm">
                  <option value="high">🔴 High Impact</option>
                  <option value="medium">🟡 Medium Impact</option>
                  <option value="low">🟢 Low Impact</option>
                </select>
                <input type="date" value={innovationForm.date} onChange={e => setInnovationForm({ ...innovationForm, date: e.target.value })} className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm [color-scheme:dark]" />
                <textarea value={innovationForm.description} onChange={e => setInnovationForm({ ...innovationForm, description: e.target.value })} placeholder="Description" rows={2} className="md:col-span-2 bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm resize-none" />
              </div>
              <button onClick={addInnovation} className="mt-4 w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 rounded-lg">💡 Add Innovation</button>
            </div>

            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">💡 Innovations ({innovations.length})</h3>
              <div className="space-y-3">
                {innovations.map(i => (
                  <div key={i.id} className="bg-[#0f172a] border border-[#334155] rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-white">{i.title}</h4>
                      <div className="flex gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${i.impact === 'high' ? 'bg-red-500/20 text-red-400' : i.impact === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{i.impact}</span>
                        <button onClick={() => deleteInnovation(i.id)} className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded">Del</button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-300 mb-2">{i.description}</p>
                    <div className="flex gap-4 text-xs text-slate-400">
                      <span>📅 {i.date}</span>
                      <span>{i.type}</span>
                      <span className={`px-2 py-0.5 rounded ${i.status === 'implemented' ? 'bg-emerald-500/20 text-emerald-400' : i.status === 'development' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-500/20 text-slate-400'}`}>{i.status}</span>
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
              <div className="bg-[#1e293b] border-l-4 border-blue-500 rounded-lg p-4">
                <p className="text-xs text-slate-400">Total Trainings</p>
                <p className="text-2xl font-bold text-white">{trainings.length}</p>
              </div>
              <div className="bg-[#1e293b] border-l-4 border-emerald-500 rounded-lg p-4">
                <p className="text-xs text-slate-400">Completed</p>
                <p className="text-2xl font-bold text-white">{trainings.filter(t => t.status === 'completed').length}</p>
              </div>
              <div className="bg-[#1e293b] border-l-4 border-yellow-500 rounded-lg p-4">
                <p className="text-xs text-slate-400">Planned</p>
                <p className="text-2xl font-bold text-white">{trainings.filter(t => t.status === 'planned').length}</p>
              </div>
            </div>

            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">🎓 Add Training</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input value={trainingForm.title} onChange={e => setTrainingForm({ ...trainingForm, title: e.target.value })} placeholder="Training Title" className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" />
                <select value={trainingForm.category} onChange={e => setTrainingForm({ ...trainingForm, category: e.target.value as any })} className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm">
                  <option value="technical">🔧 Technical</option>
                  <option value="safety">⛑️ Safety</option>
                  <option value="quality">✅ Quality</option>
                  <option value="management">📊 Management</option>
                </select>
                <input value={trainingForm.target} onChange={e => setTrainingForm({ ...trainingForm, target: e.target.value })} placeholder="Target Audience" className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" />
                <input value={trainingForm.duration} onChange={e => setTrainingForm({ ...trainingForm, duration: e.target.value })} placeholder="Duration" className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" />
                <input type="date" value={trainingForm.date} onChange={e => setTrainingForm({ ...trainingForm, date: e.target.value })} className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm [color-scheme:dark]" />
                <select value={trainingForm.status} onChange={e => setTrainingForm({ ...trainingForm, status: e.target.value as any })} className="bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm">
                  <option value="planned">📅 Planned</option>
                  <option value="completed">✅ Completed</option>
                </select>
              </div>
              <button onClick={addTraining} className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg">🎓 Add Training</button>
            </div>

            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">🎓 Trainings ({trainings.length})</h3>
              <div className="space-y-3">
                {trainings.map(t => (
                  <div key={t.id} className="bg-[#0f172a] border border-[#334155] rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-white">{t.title}</h4>
                      <div className="flex gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${t.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{t.status}</span>
                        <button onClick={() => deleteTraining(t.id)} className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded">Del</button>
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
