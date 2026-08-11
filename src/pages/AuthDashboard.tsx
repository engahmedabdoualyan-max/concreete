import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';

export default function AuthDashboard() {
  const { currentUser, registeredUsers, login, register, verifyAndActivate, logout, generatedCode } = useAuth();
  const { t } = useLang();
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    plantName: '',
    country: '',
    city: '',
    phone: '',
  });
  const [verificationCode, setVerificationCode] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    
    try {
      const success = await login(formData.username, formData.password);
      if (success) {
        setMessage(t('loginSuccess'));
        setMessageType('success');
      } else {
        setMessage(t('invalidCredentials'));
        setMessageType('error');
      }
    } catch (error) {
      setMessage(t('loginFailed'));
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    
    try {
      const user = {
        ...formData,
        status: 'pending',
      };
      const result = await register(user);
      if (result.success) {
        setMessage(`${t('registrationSuccess')} ${t('verificationCode')}: ${result.code}`);
        setMessageType('success');
        setVerificationCode(result.code);
      } else {
        setMessage(t('usernameExists'));
        setMessageType('error');
      }
    } catch (error) {
      setMessage(t('registrationFailed'));
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    
    try {
      const success = await verifyAndActivate(verificationCode);
      if (success) {
        setMessage(t('accountVerified'));
        setMessageType('success');
        setVerificationCode('');
      } else {
        setMessage(t('invalidVerificationCode'));
        setMessageType('error');
      }
    } catch (error) {
      setMessage(t('verificationFailed'));
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    setMessage(t('logoutSuccess'));
    setMessageType('success');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="bg-white/[0.04] rounded-2xl border border-white/10 p-8 backdrop-blur-xl">
          <div className="mb-8">
            <h1 className="text-3xl font-black tracking-tight text-white mb-2">{t('authDashboard')}</h1>
            <p className="text-slate-400">{t('authDashboardDesc')}</p>
          </div>

          <div className="flex gap-4 mb-8 border-b border-white/10">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 font-medium transition-colors
                ${activeTab === 'overview'
                  ? 'text-sky-300 border-b-2 border-sky-400'
                  : 'text-slate-400 hover:text-sky-300'}
              `}
            >
              {t('overview')}
            </button>
            <button
              onClick={() => setActiveTab('login')}
              className={`px-4 py-2 font-medium transition-colors
                ${activeTab === 'login'
                  ? 'text-sky-300 border-b-2 border-sky-400'
                  : 'text-slate-400 hover:text-sky-300'}
              `}
            >
              {t('login')}
            </button>
            <button
              onClick={() => setActiveTab('register')}
              className={`px-4 py-2 font-medium transition-colors
                ${activeTab === 'register'
                  ? 'text-sky-300 border-b-2 border-sky-400'
                  : 'text-slate-400 hover:text-sky-300'}
              `}
            >
              {t('register')}
            </button>
            <button
              onClick={() => setActiveTab('verify')}
              className={`px-4 py-2 font-medium transition-colors
                ${activeTab === 'verify'
                  ? 'text-sky-300 border-b-2 border-sky-400'
                  : 'text-slate-400 hover:text-sky-300'}
              `}
            >
              {t('verify')}
            </button>
          </div>

          {message && (
            <div className={`mb-6 p-4 rounded-lg
              ${messageType === 'success'
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'}
            `}
            >
              {message}
            </div>
          )}

          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white/[0.03] rounded-lg p-6 border border-white/10">
                <h3 className="text-lg font-semibold text-white mb-2">{t('currentUser')}</h3>
                {currentUser ? (
                  <div>
                    <p className="text-2xl font-bold text-sky-400">{currentUser.username}</p>
                    <p className="text-sm text-slate-400 mt-1">{currentUser.email}</p>
                    <p className="text-sm text-slate-400 mt-1">{currentUser.plantName}</p>
                  </div>
                ) : (
                  <p className="text-slate-400">{t('noUserLoggedIn')}</p>
                )}
              </div>

              <div className="bg-white/[0.03] rounded-lg p-6 border border-white/10">
                <h3 className="text-lg font-semibold text-white mb-2">{t('registeredUsers')}</h3>
                <p className="text-2xl font-bold text-emerald-400">{registeredUsers.length}</p>
                <p className="text-sm text-slate-400 mt-1">{t('totalRegistered')}</p>
              </div>

              <div className="bg-white/[0.03] rounded-lg p-6 border border-white/10">
                <h3 className="text-lg font-semibold text-white mb-2">{t('generatedCode')}</h3>
                <p className="text-2xl font-bold text-sky-400">{generatedCode || t('noCode')}</p>
                <p className="text-sm text-slate-400 mt-1">{t('forVerification')}</p>
              </div>

              <div className="bg-white/[0.03] rounded-lg p-6 border border-white/10">
                <h3 className="text-lg font-semibold text-white mb-2">{t('status')}</h3>
                {currentUser ? (
                  <button
                    onClick={handleLogout}
                    className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg font-medium hover:bg-red-500/30 transition-colors"
                  >
                    {t('logout')}
                  </button>
                ) : (
                  <p className="text-sm text-slate-400">{t('notAuthenticated')}</p>
                )}
              </div>

              <div className="md:col-span-2 lg:col-span-4">
                <h3 className="text-lg font-semibold text-white mb-4">{t('recentUsers')}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="py-3 px-4 text-[10px] uppercase tracking-wider text-slate-400 font-medium">{t('username')}</th>
                        <th className="py-3 px-4 text-[10px] uppercase tracking-wider text-slate-400 font-medium">{t('email')}</th>
                        <th className="py-3 px-4 text-[10px] uppercase tracking-wider text-slate-400 font-medium">{t('plant')}</th>
                        <th className="py-3 px-4 text-[10px] uppercase tracking-wider text-slate-400 font-medium">{t('status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registeredUsers.slice(0, 5).map((user) => (
                        <tr key={user.username} className="border-b border-white/10 hover:bg-white/[0.06]">
                          <td className="py-3 px-4 text-white">{user.username}</td>
                          <td className="py-3 px-4 text-slate-400">{user.email}</td>
                          <td className="py-3 px-4 text-slate-400">{user.plantName}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded text-xs font-medium
                              ${user.status === 'active'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : user.status === 'pending'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-slate-500/20 text-slate-400'}
                            `}
                            >
                              {user.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'login' && (
            <form onSubmit={handleLogin} className="max-w-md mx-auto">
              <h3 className="text-xl font-semibold text-white mb-6">{t('loginForm')}</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">{t('username')}</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">{t('password')}</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                    required
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white py-3 px-4 rounded-lg font-bold transition-all duration-300 disabled:opacity-50 shadow-[0_0_20px_rgba(56,189,248,0.3)]"
                >
                  {isLoading ? t('loggingIn') : t('login')}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'register' && (
            <form onSubmit={handleRegister} className="max-w-md mx-auto">
              <h3 className="text-xl font-semibold text-white mb-6">{t('registrationForm')}</h3>
              <div className="bg-yellow-500/10 border border-dashed border-yellow-500 rounded-lg p-3 text-yellow-300 text-xs text-center mb-4">
                {t('registrationNote')}<br />{t('registrationNoteContact')}
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">{t('username')}</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">{t('email')}</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">{t('plantNameField')}</label>
                  <input
                    type="text"
                    value={formData.plantName}
                    onChange={(e) => setFormData({ ...formData, plantName: e.target.value })}
                    className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                    required
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-white py-3 px-4 rounded-lg font-bold transition-all duration-300 disabled:opacity-50 shadow-[0_0_20px_rgba(56,189,248,0.3)]"
                >
                  {isLoading ? t('registering') : t('register')}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'verify' && (
            <form onSubmit={handleVerify} className="max-w-md mx-auto">
              <h3 className="text-xl font-semibold text-white mb-6">{t('accountVerification')}</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">{t('verificationCode')}</label>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] font-mono text-center text-lg transition"
                    placeholder="123456"
                    maxLength={6}
                    required
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white py-3 px-4 rounded-lg font-bold transition-all duration-300 disabled:opacity-50 shadow-[0_0_20px_rgba(56,189,248,0.3)]"
                >
                  {isLoading ? t('verifying') : t('verifyAccount')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
