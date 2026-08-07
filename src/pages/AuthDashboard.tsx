import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthDashboard() {
  const { currentUser, registeredUsers, login, register, verifyAndActivate, logout, generatedCode } = useAuth();
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
        setMessage('Login successful!');
        setMessageType('success');
      } else {
        setMessage('Invalid credentials');
        setMessageType('error');
      }
    } catch (error) {
      setMessage('Login failed');
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
        setMessage(`Registration successful! Verification code: ${result.code}`);
        setMessageType('success');
        setVerificationCode(result.code);
      } else {
        setMessage('Username already exists');
        setMessageType('error');
      }
    } catch (error) {
      setMessage('Registration failed');
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
        setMessage('Account verified successfully! Your private 300 MB database is ready (تم إنشاء مساحتك الخاصة 300 ميجا)');
        setMessageType('success');
        setVerificationCode('');
      } else {
        setMessage('Invalid verification code');
        setMessageType('error');
      }
    } catch (error) {
      setMessage('Verification failed');
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    setMessage('Logged out successfully');
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
    <div className="min-h-screen bg-[#0f172a] text-[#f1f5f9] py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Authentication Dashboard</h1>
            <p className="text-slate-400">Manage user authentication and registration</p>
          </div>

          <div className="flex gap-4 mb-8 border-b border-[#334155]">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 font-medium transition-colors
                ${activeTab === 'overview'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-white'}
              `}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('login')}
              className={`px-4 py-2 font-medium transition-colors
                ${activeTab === 'login'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-white'}
              `}
            >
              Login
            </button>
            <button
              onClick={() => setActiveTab('register')}
              className={`px-4 py-2 font-medium transition-colors
                ${activeTab === 'register'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-white'}
              `}
            >
              Register
            </button>
            <button
              onClick={() => setActiveTab('verify')}
              className={`px-4 py-2 font-medium transition-colors
                ${activeTab === 'verify'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-white'}
              `}
            >
              Verify
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
              <div className="bg-[#0f172a] rounded-lg p-6 border border-[#334155]">
                <h3 className="text-lg font-semibold text-white mb-2">Current User</h3>
                {currentUser ? (
                  <div>
                    <p className="text-2xl font-bold text-blue-400">{currentUser.username}</p>
                    <p className="text-sm text-slate-400 mt-1">{currentUser.email}</p>
                    <p className="text-sm text-slate-400 mt-1">{currentUser.plantName}</p>
                  </div>
                ) : (
                  <p className="text-slate-400">No user logged in</p>
                )}
              </div>

              <div className="bg-[#0f172a] rounded-lg p-6 border border-[#334155]">
                <h3 className="text-lg font-semibold text-white mb-2">Registered Users</h3>
                <p className="text-2xl font-bold text-emerald-400">{registeredUsers.length}</p>
                <p className="text-sm text-slate-400 mt-1">Total registered</p>
              </div>

              <div className="bg-[#0f172a] rounded-lg p-6 border border-[#334155]">
                <h3 className="text-lg font-semibold text-white mb-2">Generated Code</h3>
                <p className="text-2xl font-bold text-purple-400">{generatedCode || 'No code'}</p>
                <p className="text-sm text-slate-400 mt-1">For verification</p>
              </div>

              <div className="bg-[#0f172a] rounded-lg p-6 border border-[#334155]">
                <h3 className="text-lg font-semibold text-white mb-2">Status</h3>
                {currentUser ? (
                  <button
                    onClick={handleLogout}
                    className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg font-medium hover:bg-red-500/30 transition-colors"
                  >
                    Logout
                  </button>
                ) : (
                  <p className="text-sm text-slate-400">Not authenticated</p>
                )}
              </div>

              <div className="md:col-span-2 lg:col-span-4">
                <h3 className="text-lg font-semibold text-white mb-4">Recent Users</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-[#334155]">
                        <th className="py-3 px-4 text-slate-400 font-medium">Username</th>
                        <th className="py-3 px-4 text-slate-400 font-medium">Email</th>
                        <th className="py-3 px-4 text-slate-400 font-medium">Plant</th>
                        <th className="py-3 px-4 text-slate-400 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registeredUsers.slice(0, 5).map((user) => (
                        <tr key={user.username} className="border-b border-[#334155] hover:bg-[#1e2a3d]">
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
              <h3 className="text-xl font-semibold text-white mb-6">Login Form</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Username</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1e293b] border border-[#334155] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1e293b] border border-[#334155] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white py-3 px-4 rounded-lg font-bold transition-all duration-300 disabled:opacity-50"
                >
                  {isLoading ? 'Logging in...' : 'Login'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'register' && (
            <form onSubmit={handleRegister} className="max-w-md mx-auto">
              <h3 className="text-xl font-semibold text-white mb-6">Registration Form</h3>
              <div className="bg-yellow-500/10 border border-dashed border-yellow-500 rounded-lg p-3 text-yellow-300 text-xs text-center mb-4">
                💾 عند التسجيل يتم إنشاء <strong>قاعدة بيانات خاصة</strong> بحجم <strong>300 MB</strong><br />
                إذا احتجت قاعدة أكبر تواصل مع المبرمج
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Username</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1e293b] border border-[#334155] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1e293b] border border-[#334155] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Plant Name</label>
                  <input
                    type="text"
                    value={formData.plantName}
                    onChange={(e) => setFormData({ ...formData, plantName: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1e293b] border border-[#334155] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1e293b] border border-[#334155] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white py-3 px-4 rounded-lg font-bold transition-all duration-300 disabled:opacity-50"
                >
                  {isLoading ? 'Registering...' : 'Register'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'verify' && (
            <form onSubmit={handleVerify} className="max-w-md mx-auto">
              <h3 className="text-xl font-semibold text-white mb-6">Account Verification</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Verification Code</label>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    className="w-full px-3 py-2 bg-[#1e293b] border border-[#334155] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-center text-lg"
                    placeholder="123456"
                    maxLength={6}
                    required
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white py-3 px-4 rounded-lg font-bold transition-all duration-300 disabled:opacity-50"
                >
                  {isLoading ? 'Verifying...' : 'Verify Account'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
