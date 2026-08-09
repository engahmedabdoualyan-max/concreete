import { useState, type FormEventHandler } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserSession } from '../context/AuthContext';
import BrandLogo from './BrandLogo';

export default function LoginRegister() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [plantName, setPlantName] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { login, register, verifyAndActivate, generatedCode } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      const success = await login(username, password);
      if (success) {
        navigate('/');
      } else {
        setError('اسم المستخدم أو كلمة المرور غير صحيحة');
      }
    } catch (err) {
      setError('حدث خطأ أثناء تسجيل الدخول');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    if (!email || !plantName) {
      setError('يرجى إدخال البريد الإلكتروني واسم المصنع');
      setIsLoading(false);
      return;
    }
    
    const user: UserSession = {
      username,
      password,
      country,
      city,
      plantName,
      phone,
      email,
      status: 'pending'
    };
    
    try {
      const result = await register(user);
      if (result.success) {
        setIsLogin(false);
        setVerificationCode(result.code);
        setError(`تم إرسال رمز التحقق (${result.code}) إلى بريدك الإلكتروني: ${email}`);
      } else {
        setError('اسم المستخدم موجود بالفعل');
      }
    } catch (err) {
      setError('حدث خطأ أثناء التسجيل');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      const success = await verifyAndActivate(verificationCode);
      if (success) {
        navigate('/');
      } else {
        setError('رمز التحقق غير صحيح أو منتهي الصلاحية');
      }
    } catch (err) {
      setError('حدث خطأ أثناء التحقق');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError('');
    setIsLoading(true);
    
    const user: UserSession = {
      username,
      password,
      country,
      city,
      plantName,
      phone,
      email,
      status: 'pending'
    };
    
    try {
      const result = await register(user);
      if (result.success) {
        setVerificationCode(result.code);
        setError(`تم إعادة إرسال رمز التحقق (${result.code}) إلى بريدك الإلكتروني: ${email}`);
      } else {
        setError('حدث خطأ أثناء إعادة إرسال الرمز');
      }
    } catch (err) {
      setError('حدث خطأ أثناء إعادة إرسال الرمز');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B111E] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center">
            <BrandLogo width={220} fill rounded="rounded-2xl" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            {isLogin ? 'تسجيل الدخول' : 'إنشاء حساب'}
          </h2>
          <p className="mt-2 text-center text-sm text-slate-400">
            {!isLogin && !verificationCode ? 'انضم إلى نظام إدارة مصانع الخرسانة' : 'سنظام إدارة مصانع الخرسانة'}
          </p>
        </div>
        
        {error && (
          <div className={`rounded-lg p-3 text-sm font-medium ${error.includes('رمز التحقق') || error.includes('تم إرسال') || error.includes('تم إعادة إرسال') 
            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>            {error}
          </div>
        )}
        
        {!isLogin && !verificationCode ? (
          <form className="mt-8 space-y-6" onSubmit={handleRegister}>
            <div className="bg-yellow-500/10 border border-dashed border-yellow-500 rounded-lg p-3 text-yellow-300 text-xs text-center">
              💾 عند التسجيل يتم إنشاء <strong>قاعدة بيانات خاصة</strong> بحجم <strong>300 ميجا</strong><br />
              إذا احتجت قاعدة أكبر تواصل مع المبرمج ✉️
            </div>
            <div className="rounded-md shadow-sm space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-1">اسم المستخدم</label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] placeholder-slate-500"
                  placeholder="اسم المستخدم"
                />
              </div>
              
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">البريد الإلكتروني</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] placeholder-slate-500"
                  placeholder="you@example.com"
                />
              </div>
              
              <div>
                <label htmlFor="plantName" className="block text-sm font-medium text-slate-300 mb-1">اسم المصنع</label>
                <input
                  id="plantName"
                  name="plantName"
                  type="text"
                  required
                  value={plantName}
                  onChange={(e) => setPlantName(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] placeholder-slate-500"
                  placeholder="اسم مصنع الخرسانة الخاص بك"
                />
              </div>
              
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">كلمة المرور</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] placeholder-slate-500"
                  placeholder="كلمة المرور"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="country" className="block text-sm font-medium text-slate-300 mb-1">البلد</label>
                  <input
                    id="country"
                    name="country"
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="appearance-none relative block w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] placeholder-slate-500"
                    placeholder="مصر"
                  />
                </div>
                
                <div>
                  <label htmlFor="city" className="block text-sm font-medium text-slate-300 mb-1">المدينة</label>
                  <input
                    id="city"
                    name="city"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="appearance-none relative block w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] placeholder-slate-500"
                    placeholder="القاهرة"
                  />
                </div>
              </div>
              
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-slate-300 mb-1">رقم الهاتف</label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] placeholder-slate-500"
                  placeholder="+20 100 100 6627"
                />
              </div>
            </div>
            
            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-[0_0_20px_rgba(56,189,248,0.3)]"
              >
                {isLoading ? 'جاري إنشاء الحساب...' : 'إنشاء حساب'}
              </button>
            </div>
            
            <div className="text-center">
              <button
                type="button"
                onClick={() => setIsLogin(true)}
                className="font-medium text-sky-400 hover:text-sky-300 transition-colors"
              >
                هل لديك حساب بالفعل؟ تسجيل الدخول
              </button>
            </div>
          </form>
        ) : isLogin ? (
          <form className="mt-8 space-y-6" onSubmit={handleLogin}>
            <div className="rounded-md shadow-sm space-y-4">
              <div>
                <label htmlFor="username-login" className="block text-sm font-medium text-slate-300 mb-1">اسم المستخدم</label>
                <input
                  id="username-login"
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] placeholder-slate-500"
                  placeholder="اسم المستخدم"
                />
              </div>
              
              <div>
                <label htmlFor="password-login" className="block text-sm font-medium text-slate-300 mb-1">كلمة المرور</label>
                <input
                  id="password-login"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] placeholder-slate-500"
                  placeholder="كلمة المرور"
                />
              </div>
            </div>
            
            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-[0_0_20px_rgba(56,189,248,0.3)]"
              >
                {isLoading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
              </button>
            </div>
            
            <div className="text-center">
              <button
                type="button"
                onClick={() => setIsLogin(false)}
                className="font-medium text-sky-400 hover:text-sky-300 transition-colors"
              >
                ليس لديك حساب؟ إنشاء حساب
              </button>
            </div>
          </form>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleVerify}>
            <div className="rounded-md shadow-sm space-y-4">
              <div className="text-center">
                <p className="text-slate-300 mb-2">تم إرسال رمز التحقق إلى بريدك الإلكتروني</p>
                <p className="text-sm text-slate-400 mb-4">{email}</p>
              </div>
              
              <div>
                <label htmlFor="verificationCode" className="block text-sm font-medium text-slate-300 mb-1">رمز التحقق</label>
                <input
                  id="verificationCode"
                  name="verificationCode"
                  type="text"
                  required
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] placeholder-slate-500 text-center text-2xl font-bold tracking-widest"
                  placeholder="123456"
                  maxLength={6}
                />
              </div>
            </div>
            
            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-[0_0_20px_rgba(56,189,248,0.3)]"
              >
                {isLoading ? 'جاري التحقق...' : 'تفعيل الحساب'}
              </button>
            </div>
            
            <div className="text-center space-y-2">
              <button
                type="button"
                onClick={() => setIsLogin(true)}
                className="font-medium text-sky-400 hover:text-sky-300 transition-colors text-sm"
              >
                العودة لتسجيل الدخول
              </button>
              <br />
              <button
                type="button"
                onClick={handleResendCode}
                disabled={isLoading}
                className="font-medium text-green-400 hover:text-green-300 transition-colors text-sm"
              >
                إعادة إرسال رمز التحقق
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
