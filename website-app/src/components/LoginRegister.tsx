import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLoginRegisterDict } from '../i18n/loginRegisterDict';
import BrandLogo from './BrandLogo';
import ServerSettings from './ServerSettings';
import { isTauriRuntime } from '../field/tauri';

export default function LoginRegister() {
  const t = useLoginRegisterDict();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const success = await login(identifier, password);
      if (success) {
        // Desktop workstations land on the app-like field hub; browsers keep
        // the classic dashboard landing.
        navigate(isTauriRuntime() ? '/field' : '/');
      } else {
        setError(t('errBadCredentials'));
      }
    } catch (err) {
      setError(t('errGeneric'));
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
            {t('loginTitle')}
          </h2>
          <p className="mt-2 text-center text-sm text-slate-400">
            {t('subtitle')}
          </p>
        </div>

        {error && (
          <div className="rounded-lg p-3 text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/30">
            {error}
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="bg-sky-500/10 border border-dashed border-sky-500/40 rounded-lg p-3 text-sky-300 text-xs text-center">
            {t('unifiedNote')}
          </div>
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="identifier-login" className="block text-sm font-medium text-slate-300 mb-1">
                {t('identifierLabel')}
              </label>
              <input
                id="identifier-login"
                name="identifier"
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] placeholder-slate-500"
                placeholder={t('idPlaceholder')}
              />
            </div>

            <div>
              <label htmlFor="password-login" className="block text-sm font-medium text-slate-300 mb-1">{t('passwordLabel')}</label>
              <input
                id="password-login"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] placeholder-slate-500"
                placeholder={t('passwordPh')}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-[0_0_20px_rgba(56,189,248,0.3)]"
            >
              {isLoading ? t('loggingIn') : t('loginBtn')}
            </button>
          </div>

          <div className="text-center text-xs text-slate-400">
            {t('accountsNote')}
          </div>

          <ServerSettings />
        </form>
      </div>
    </div>
  );
}
