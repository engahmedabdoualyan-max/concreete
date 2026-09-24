import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
import { HashRouter } from 'react-router-dom';
import { DateProvider } from '../context/DateContext';
import { LangProvider } from '../context/LangContext';
import { AuthProvider } from '../context/AuthContext';
import { AdminProvider } from '../context/AdminContext';

/**
 * The repository keeps the owner's older React Router UI under `src/pages`.
 * Next still discovers these files as Pages Router routes, so they need the
 * same providers as the Vite entrypoint during static/build rendering.
 */
export default function LegacyPagesApp({ Component, pageProps }: AppProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <DateProvider>
      <LangProvider>
        <AuthProvider>
          <AdminProvider>
            <HashRouter>
              <Component {...pageProps} />
            </HashRouter>
          </AdminProvider>
        </AuthProvider>
      </LangProvider>
    </DateProvider>
  );
}
