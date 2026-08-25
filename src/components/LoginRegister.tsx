import { useState, type FormEventHandler } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserSession } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
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
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const { login, register, verifyAndActivate, generatedCode } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSuccess(false);
    setIsLoading(true);
    
    try {
      const success = await login(username, password);
      if (success) {
        navigate('/');
      } else {
        setError(t('invalidCredentials'));
      }
    } catch (err) {
      setError(t('loginError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSuccess(false);
    setIsLoading(true);
    
    if (!email || !plantName) {
      setError(t('enterEmailAndPlantName'));
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
        setIsSuccess(true);
        setError(`${t('verificationCodeSent')} (${result.code}) ${t('toYourEmail')}: ${email}`);
      } else {
        setError(t('usernameExists'));
      }
    } catch (err) {
      setError(t('registerError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSuccess(false);
    setIsLoading(true);
    
    try {
      const success = await verifyAndActivate(verificationCode);
      if (success) {
        navigate('/');
      } else {
        setError(t('invalidVerificationCode'));
      }
    } catch (err) {
      setError(t('verificationError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError('');
    setIsSuccess(false);
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
        setIsSuccess(true);
        setError(`${t('verificationCodeResent')} (${result.code}) ${t('toYourEmail')}: ${email}`);
      } else {
        setError(t('resendCodeError'));
      }
    } catch (err) {
      setError(t('resendCodeError'));
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
            {isLogin ? t('login') : t('createAccount')}
          </h2>
          <p className="mt-2 text-center text-sm text-slate-400">
            {!isLogin && !verificationCode ? t('joinConcretePlantsSystem') : t('concretePlantsSystem')}
          </p>
        </div>
        
        {error && (
          <div className={`rounded-lg p-3 text-sm font-medium ${isSuccess
            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>            {error}
          </div>
        )}
        
        {!isLogin && !verificationCode ? (
          <form className="mt-8 space-y-6" onSubmit={handleRegister}>
            <div className="bg-yellow-500/10 border border-dashed border-yellow-500 rounded-lg p-3 text-yellow-300 text-xs text-center">
              💾 {t('registrationCreatesDb')} <strong>{t('privateDatabase')}</strong> {t('databaseSize')} <strong>300 MB</strong><br />
              {t('largerDatabaseContact')} ✉️
            </div>
            <div className="rounded-md shadow-sm space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-1">{t('username')}</label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] placeholder-slate-500"
                  placeholder={t('username')}
                />
              </div>
              
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">{t('email')}</label>
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
                <label htmlFor="plantName" className="block text-sm font-medium text-slate-300 mb-1">{t('plantName')}</label>
                <input
                  id="plantName"
                  name="plantName"
                  type="text"
                  required
                  value={plantName}
                  onChange={(e) => setPlantName(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] placeholder-slate-500"
                  placeholder={t('yourPlantName')}
                />
              </div>
              
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">{t('password')}</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] placeholder-slate-500"
                  placeholder={t('password')}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="country" className="block text-sm font-medium text-slate-300 mb-1">{t('country')}</label>
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
                  <label htmlFor="city" className="block text-sm font-medium text-slate-300 mb-1">{t('city')}</label>
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
                <label htmlFor="phone" className="block text-sm font-medium text-slate-300 mb-1">{t('phone')}</label>
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
                {isLoading ? t('creatingAccount') : t('createAccount')}
              </button>
            </div>
            
            <div className="text-center">
              <button
                type="button"
                onClick={() => setIsLogin(true)}
                className="font-medium text-sky-400 hover:text-sky-300 transition-colors"
              >
                {t('alreadyHaveAccount')}
              </button>
            </div>
          </form>
        ) : isLogin ? (
          <form className="mt-8 space-y-6" onSubmit={handleLogin}>
            <div className="rounded-md shadow-sm space-y-4">
              <div>
                <label htmlFor="username-login" className="block text-sm font-medium text-slate-300 mb-1">{t('username')}</label>
                <input
                  id="username-login"
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] placeholder-slate-500"
                  placeholder={t('username')}
                />
              </div>
              
              <div>
                <label htmlFor="password-login" className="block text-sm font-medium text-slate-300 mb-1">{t('password')}</label>
                <input
                  id="password-login"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] placeholder-slate-500"
                  placeholder={t('password')}
                />
              </div>
            </div>
            
            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-[0_0_20px_rgba(56,189,248,0.3)]"
              >
                {isLoading ? t('loggingIn') : t('login')}
              </button>
            </div>
            
            <div className="text-center">
              <button
                type="button"
                onClick={() => setIsLogin(false)}
                className="font-medium text-sky-400 hover:text-sky-300 transition-colors"
              >
                {t('noAccountCreate')}
              </button>
            </div>
          </form>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleVerify}>
            <div className="rounded-md shadow-sm space-y-4">
              <div className="text-center">
                <p className="text-slate-300 mb-2">{t('verificationSentToEmail')}</p>
                <p className="text-sm text-slate-400 mb-4">{email}</p>
              </div>
              
              <div>
                <label htmlFor="verificationCode" className="block text-sm font-medium text-slate-300 mb-1">{t('verificationCode')}</label>
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
                {isLoading ? t('verifying') : t('activateAccount')}
              </button>
            </div>
            
            <div className="text-center space-y-2">
              <button
                type="button"
                onClick={() => setIsLogin(true)}
                className="font-medium text-sky-400 hover:text-sky-300 transition-colors text-sm"
              >
                {t('backToLogin')}
              </button>
              <br />
              <button
                type="button"
                onClick={handleResendCode}
                disabled={isLoading}
                className="font-medium text-green-400 hover:text-green-300 transition-colors text-sm"
              >
                {t('resendVerificationCode')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
