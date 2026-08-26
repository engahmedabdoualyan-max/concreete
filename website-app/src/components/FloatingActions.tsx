import { useState, type FormEvent, type ReactNode } from 'react';
import { useLang } from '../context/LangContext';
import { generateManualPdf } from './ManualPdf';
import { generateManualPdfEn } from './ManualPdfEn';
import type { Translations } from '../context/translations';

type ModalKind = 'features' | 'rate' | 'contact' | null;
const PDF_LABEL = 'دليل PDF';

const FEATURES: { icon: string; key: keyof Translations }[] = [
  { icon: '📱', key: 'ftAppAndroid' },
  { icon: '🍎', key: 'ftAppIos' },
  { icon: '🔗', key: 'ftAppNote' },
  { icon: '🚚', key: 'ftOperations' },
  { icon: '🏭', key: 'ftProduction' },
  { icon: '📅', key: 'ftSchedule' },
  { icon: '🔧', key: 'ftWorkshop' },
  { icon: '🎛️', key: 'ftMixing' },
  { icon: '📊', key: 'ftEvaluation' },
  { icon: '📦', key: 'ftOrders' },
  { icon: '⚙️', key: 'ftAdmin' },
  { icon: '💼', key: 'ftFinance' },
  { icon: '📒', key: 'ftLedger' },
  { icon: '🗓️', key: 'ftCommitments' },
  { icon: '💰', key: 'ftExpenses' },
  { icon: '🏭', key: 'ftSuppliers' },
  { icon: '🛢️', key: 'ftInventory' },
  { icon: '🛡️', key: 'ftRisk' },
  { icon: '🚨', key: 'ftBreakdown' },
  { icon: '🧾', key: 'ftInvoice' },
  { icon: '📤', key: 'ftExports' },
];

const STAR_COLORS = ['text-slate-400', 'text-yellow-400'];

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[130] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#0B111E]/95 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative backdrop-blur-xl"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] border border-white/10 text-slate-400 hover:text-white hover:border-sky-400/60 transition-colors"
          aria-label="close"
        >
          ✕
        </button>
        <h3 className="text-xl font-bold text-white mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export default function FloatingActions() {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [rated, setRated] = useState(false);
  const [contact, setContact] = useState({ email: '', phone: '', message: '' });
  const [contactError, setContactError] = useState('');
  const [contactSent, setContactSent] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<{ on: boolean; done: number; total: number }>({ on: false, done: 0, total: 0 });

  const handleManualPdf = async () => {
    if (pdfBusy.on) return;
    setOpen(false);
    setPdfBusy({ on: true, done: 0, total: 0 });
    try {
      const gen = lang === 'en' ? generateManualPdfEn : generateManualPdf;
      const pages = await gen((done, total) => setPdfBusy({ on: true, done, total }));
      alert(lang === 'en'
        ? `✅ Guide downloaded (${pages} pages) — check your Downloads folder`
        : `✅ تم تحميل الدليل (${pages} صفحات) — افتح مجلد التنزيلات`);
    } catch (e) {
      console.error('manual pdf failed', e);
      alert(lang === 'en'
        ? '❌ Could not build the PDF — try Chrome'
        : '❌ تعذر توليد الـPDF — جرّب متصفح Chrome');
    }
    setPdfBusy({ on: false, done: 0, total: 0 });
  };

  const openModal = (kind: Exclude<ModalKind, null>) => {
    setModal(kind);
    setOpen(false);
  };

  const handleContact = (e: FormEvent) => {
    e.preventDefault();
    if (!contact.email || !contact.phone || !contact.message) {
      setContactError(t('fillAllFields'));
      return;
    }
    setContactError('');
    setContactSent(true);
  };

  const actionButton = (icon: string, label: string, onClick: () => void, color: string) => (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-bold text-sm text-white shadow-xl border transition-all duration-200 hover:-translate-y-0.5 ${color}`}
    >
      <span className="text-base">{icon}</span>
      {label}
    </button>
  );

  return (
    <>
      {modal === 'features' && (
        <Modal title={t('featuresTitle')} onClose={() => setModal(null)}>
          <div className="grid grid-cols-1 gap-2.5 max-h-[50vh] overflow-y-auto pr-1">
            {FEATURES.map(f => (
              <div key={f.key} className="flex items-start gap-3 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3">
                <span className="text-xl">{f.icon}</span>
                <span className="text-sm text-slate-200 leading-relaxed">{t(f.key)}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {modal === 'rate' && (
        <Modal title={t('rateTitle')} onClose={() => setModal(null)}>
          {rated ? (
            <div className="text-center py-6">
              <p className="text-5xl mb-4">🎉</p>
              <p className="text-emerald-400 font-bold text-lg">{t('rateThanks')}</p>
              <p className="text-slate-400 text-sm mt-2">{'⭐'.repeat(rating)}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center py-4">
              <div className="flex gap-2 mb-6" onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onClick={() => { setRating(star); setRated(true); }}
                    onMouseEnter={() => setHover(star)}
                    className={`text-4xl transition-transform duration-100 hover:scale-125 ${
                      star <= (hover || rating) ? 'text-yellow-400' : 'text-slate-600'
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <p className="text-slate-400 text-sm">{t('floatingRateUs')}</p>
            </div>
          )}
        </Modal>
      )}

      {modal === 'contact' && (
        <Modal title={t('floatingContactUs')} onClose={() => setModal(null)}>
          {contactSent ? (
            <div className="text-center py-6">
              <p className="text-5xl mb-4">✅</p>
              <p className="text-emerald-400 font-bold text-lg">{t('sendSuccess')}</p>
            </div>
          ) : (
            <form onSubmit={handleContact} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">✉️ {t('email')}</label>
                <input
                  type="email"
                  value={contact.email}
                  onChange={e => setContact({ ...contact, email: e.target.value })}
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">📞 {t('phone')}</label>
                <input
                  type="tel"
                  value={contact.phone}
                  onChange={e => setContact({ ...contact, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">💬 {t('message')}</label>
                <textarea
                  rows={4}
                  value={contact.message}
                  onChange={e => setContact({ ...contact, message: e.target.value })}
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                />
              </div>
              {contactError && <p className="text-red-400 text-sm">⚠️ {contactError}</p>}
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white py-3 rounded-lg font-bold transition-all duration-300 shadow-[0_0_20px_rgba(56,189,248,0.3)]"
              >
                📨 {t('send')}
              </button>
            </form>
          )}
        </Modal>
      )}

      <div className="fixed bottom-6 right-6 z-[120] flex flex-col items-end gap-3">
        {open && (
          <div className="flex flex-col items-end gap-2">
            {actionButton(pdfBusy.on ? '⏳' : '📕', pdfBusy.on ? `${pdfBusy.done}/${pdfBusy.total}…` : (lang === 'en' ? 'PDF Guide' : PDF_LABEL), handleManualPdf, 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400')}
            {actionButton('⭐', t('floatingFeatures'), () => openModal('features'), 'bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400')}
            {actionButton('🌟', t('floatingRateUs'), () => openModal('rate'), 'bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300')}
            {actionButton('📞', t('floatingContactUs'), () => openModal('contact'), 'bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400')}
          </div>
        )}
        <button
          onClick={() => setOpen(!open)}
          className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-2xl border transition-all duration-300 ${
            open
              ? 'bg-red-600 hover:bg-red-700 border-red-400/50 text-white'
              : 'bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 border-sky-400/50 text-white'
          }`}
        >
          {open ? '✕' : '💬'}
        </button>
      </div>
    </>
  );
}
