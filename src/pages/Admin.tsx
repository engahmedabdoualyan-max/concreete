import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { useNavigate } from 'react-router-dom';

export default function AdminPanel() {
  const { currentUser } = useAuth();
  const { content, updateContent, resetToDefault } = useAdmin();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);

  useEffect(() => {
    setEditedContent(content);
  }, [content]);

  if (!currentUser) {
    navigate('/login');
    return null;
  }

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    updateContent(editedContent);
    setIsEditing(false);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f1f5f9] py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">لوحة تحكم المحتوى</h1>
              <p className="text-slate-400">إدارة محتوى شركة فيمتو سوفت للخدمات التكنولوجية</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-3 rounded-lg font-bold transition-all duration-300"
              >
                {isEditing ? 'إلغاء التعديل' : 'تعديل المحتوى'}
              </button>
              <button
                onClick={() => resetToDefault()}
                className="bg-[#334155] hover:bg-[#3f4863] text-white px-6 py-3 rounded-lg font-bold transition-all duration-300"
              >
                إعادة تعيين
              </button>
            </div>
          </div>

          {isEditing ? (
            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-white mb-4">معلومات الشركة</h2>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">اسم الشركة (عربي)</label>
                    <input
                      type="text"
                      value={editedContent.companyName}
                      onChange={(e) => setEditedContent({ ...editedContent, companyName: e.target.value })}
                      className="w-full px-3 py-2 bg-[#1e293b] border border-[#334155] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">الوصف المختصر (عربي)</label>
                    <input
                      type="text"
                      value={editedContent.companyTagline}
                      onChange={(e) => setEditedContent({ ...editedContent, companyTagline: e.target.value })}
                      className="w-full px-3 py-2 bg-[#1e293b] border border-[#334155] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">الوصف التفصيلي (عربي)</label>
                    <textarea
                      value={editedContent.companyDescription}
                      onChange={(e) => setEditedContent({ ...editedContent, companyDescription: e.target.value })}
                      rows={4}
                      className="w-full px-3 py-2 bg-[#1e293b] border border-[#334155] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">نبذة عن الشركة (عربي)</label>
                    <textarea
                      value={editedContent.aboutUsText}
                      onChange={(e) => setEditedContent({ ...editedContent, aboutUsText: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 bg-[#1e293b] border border-[#334155] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">رقم الهاتف</label>
                    <input
                      type="text"
                      value={editedContent.contactPhone}
                      onChange={(e) => setEditedContent({ ...editedContent, contactPhone: e.target.value })}
                      className="w-full px-3 py-2 bg-[#1e293b] border border-[#334155] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">البريد الإلكتروني</label>
                    <input
                      type="email"
                      value={editedContent.contactEmail}
                      onChange={(e) => setEditedContent({ ...editedContent, contactEmail: e.target.value })}
                      className="w-full px-3 py-2 bg-[#1e293b] border border-[#334155] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-white mb-4">المشاريع</h2>
                  
                  {editedContent.projects.map((project, index) => (
                    <div key={project.id} className="bg-[#0f172a] rounded-lg p-4 border border-[#334155]">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">المعرف</label>
                          <input
                            type="text"
                            value={project.id}
                            onChange={(e) => {
                              const newProjects = [...editedContent.projects];
                              newProjects[index].id = e.target.value;
                              setEditedContent({ ...editedContent, projects: newProjects });
                            }}
                            className="w-full px-2 py-1 text-sm bg-[#1e293b] border border-[#334155] text-white rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">الاسم (عربي)</label>
                          <input
                            type="text"
                            value={project.name}
                            onChange={(e) => {
                              const newProjects = [...editedContent.projects];
                              newProjects[index].name = e.target.value;
                              setEditedContent({ ...editedContent, projects: newProjects });
                            }}
                            className="w-full px-2 py-1 text-sm bg-[#1e293b] border border-[#334155] text-white rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">الوصف (عربي)</label>
                          <input
                            type="text"
                            value={project.description}
                            onChange={(e) => {
                              const newProjects = [...editedContent.projects];
                              newProjects[index].description = e.target.value;
                              setEditedContent({ ...editedContent, projects: newProjects });
                            }}
                            className="w-full px-2 py-1 text-sm bg-[#1e293b] border border-[#334155] text-white rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">الأيقونة</label>
                          <input
                            type="text"
                            value={project.icon}
                            onChange={(e) => {
                              const newProjects = [...editedContent.projects];
                              newProjects[index].icon = e.target.value;
                              setEditedContent({ ...editedContent, projects: newProjects });
                            }}
                            className="w-full px-2 py-1 text-sm bg-[#1e293b] border border-[#334155] text-white rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">الرمز اللوني</label>
                          <input
                            type="text"
                            value={project.color}
                            onChange={(e) => {
                              const newProjects = [...editedContent.projects];
                              newProjects[index].color = e.target.value;
                              setEditedContent({ ...editedContent, projects: newProjects });
                            }}
                            className="w-full px-2 py-1 text-sm bg-[#1e293b] border border-[#334155] text-white rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">الحالة</label>
                          <select
                            value={project.status}
                            onChange={(e) => {
                              const newProjects = [...editedContent.projects];
                              newProjects[index].status = e.target.value as 'active' | 'coming_soon' | 'planned';
                              setEditedContent({ ...editedContent, projects: newProjects });
                            }}
                            className="w-full px-2 py-1 text-sm bg-[#1e293b] border border-[#334155] text-white rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="active">نشطة</option>
                            <option value="coming_soon">قريباً</option>
                            <option value="planned">مخطط</option>
                          </select>
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">رابط المشروع</label>
                          <input
                            type="text"
                            value={project.url}
                            onChange={(e) => {
                              const newProjects = [...editedContent.projects];
                              newProjects[index].url = e.target.value;
                              setEditedContent({ ...editedContent, projects: newProjects });
                            }}
                            className="w-full px-2 py-1 text-sm bg-[#1e293b] border border-[#334155] text-white rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="flex justify-end pt-6 border-t border-[#334155]">
                <button
                  type="submit"
                  className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white px-8 py-3 rounded-lg font-bold transition-all duration-300"
                >
                  حفظ التغييرات
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[#0f172a] rounded-lg p-6 border border-[#334155]">
                  <h2 className="text-xl font-bold text-white mb-4">معلومات الشركة</h2>
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-slate-400">الاسم:</span>
                      <span className="text-white ml-2">{content.companyName}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">الشعار:</span>
                      <span className="text-white ml-2">{content.companyTagline}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">الوصف:</span>
                      <p className="text-white mt-1 leading-relaxed">{content.companyDescription}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">نبذة عنا:</span>
                      <p className="text-white mt-1 leading-relaxed">{content.aboutUsText}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">الهاتف:</span>
                      <span className="text-white ml-2">{content.contactPhone}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">البريد:</span>
                      <span className="text-white ml-2">{content.contactEmail}</span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-[#0f172a] rounded-lg p-6 border border-[#334155]">
                  <h2 className="text-xl font-bold text-white mb-4">عدد المشاريع</h2>
                  <p className="text-3xl font-bold text-blue-400">{content.projects.length} مشروع</p>
                  <div className="mt-4 space-y-2">
                    {content.projects.map((project) => (
                      <div key={project.id} className="flex items-center justify-between text-sm">
                        <span className="text-white">{project.name}</span>
                        <span className={`px-2 py-1 rounded text-xs font-medium
                          ${project.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 
                            project.status === 'coming_soon' ? 'bg-yellow-500/20 text-yellow-400' : 
                            'bg-slate-500/20 text-slate-400'}`}
                        >
                          {project.status === 'active' ? '✅ نشط' : 
                           project.status === 'coming_soon' ? '🟡 قريباً' : 
                           '📋 مخطط'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="bg-[#0f172a] rounded-lg p-6 border border-[#334155]">
                <h2 className="text-xl font-bold text-white mb-4">المشاريع</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {content.projects.map((project) => (
                    <div key={project.id} className="bg-[#1e293b] rounded-lg p-4 border border-[#334155]">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">{project.icon}</span>
                        <h3 className="font-bold text-white">{project.name}</h3>
                      </div>
                      <p className="text-sm text-slate-400 mb-3">{project.description}</p>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs px-2 py-1 rounded font-medium
                          ${project.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 
                            project.status === 'coming_soon' ? 'bg-yellow-500/20 text-yellow-400' : 
                            'bg-slate-500/20 text-slate-400'}`}
                        >
                          {project.status === 'active' ? '✅ نشط' : 
                           project.status === 'coming_soon' ? '🟡 قريباً' : 
                           '📋 مخطط'}
                        </span>
                        <a href={project.url} className="text-blue-400 text-xs hover:underline">الدخول →</a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
