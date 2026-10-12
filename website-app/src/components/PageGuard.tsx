import { Component, type ReactNode } from 'react';

/**
 * PageGuard — catches render crashes anywhere in the app and shows the
 * error message instead of a black screen, so the cause is diagnosable
 * on the spot (screenshot it and send it to support).
 */
export default class PageGuard extends Component<{ children: ReactNode }, { hasError: boolean; msg: string; stack: string }> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { hasError: false, msg: '', stack: '' }; }
  static getDerivedStateFromError(err: any) { return { hasError: true, msg: err?.message || String(err), stack: String((err as any)?.stack || '').slice(0, 1200) }; }
  componentDidCatch(err: any) { console.error('Page crash:', err); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#080C14] flex items-center justify-center p-6 text-center" dir="rtl">
          <div className="max-w-md rounded-2xl border border-red-500/40 bg-[#1E0B0B]/80 p-6 text-red-200 shadow-[0_0_30px_rgba(239,68,68,0.4)]">
            <h2 className="text-xl font-black text-red-400 mb-2">💥 تعذر فتح الصفحة</h2>
            <p className="text-sm font-mono break-all bg-red-500/10 p-2 rounded" dir="ltr">{this.state.msg}</p>
            {this.state.stack ? <pre className="text-[10px] font-mono break-all bg-black/40 p-2 rounded mt-2 text-left max-h-40 overflow-auto" dir="ltr">{this.state.stack}</pre> : null}
            <p className="text-xs text-red-300/70 mt-2">صور الشاشة دي وابعتها للدعم الفني</p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => window.location.reload()} className="flex-1 bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-bold px-3 py-2 rounded-lg hover:bg-red-500/25">🔁 إعادة تحميل</button>
              <button onClick={() => { try { localStorage.clear(); } catch { /* noop */ } window.location.hash = '#/login'; window.location.reload(); }} className="flex-1 bg-white/5 border border-white/15 text-slate-300 text-xs font-bold px-3 py-2 rounded-lg hover:bg-white/10">🚪 خروج ودخول جديد</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
