/**
 * ============================================================
 *  Share a report sheet as PDF over WhatsApp (best-effort)
 * ============================================================
 *  Mobile (Android/iOS): the rendered sheet becomes a PDF blob and
 *  is handed to navigator.share({files}) — WhatsApp appears as a
 *  target and receives the actual PDF file.
 *
 *  Desktop (no file-share support): the PDF downloads automatically
 *  and, when a phone number is known, the WhatsApp chat opens with
 *  a prefilled summary so the file is one attach away.
 *
 *  Arabic renders perfectly because the PDF is built from a DOM
 *  screenshot (html-to-image, html2canvas fallback) — no font
 *  shaping issues by construction.
 * ============================================================
 */

import { toCanvas } from 'html-to-image';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/** Render a report node to an A4 PDF blob (white background). */
export async function sheetPdfBlob(el: HTMLElement): Promise<Blob> {
  let dataUrl: string;
  try {
    const canvas = await toCanvas(el, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
    dataUrl = canvas.toDataURL('image/png');
  } catch {
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
    });
    dataUrl = canvas.toDataURL('image/png');
  }
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('IMG_LOAD'));
    img.src = dataUrl;
  });
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const maxW = 210 - 18;
  const maxH = 297 - 18;
  let w = maxW;
  let h = (w * img.height) / img.width;
  if (h > maxH) {
    h = maxH;
    w = (h * img.width) / img.height;
  }
  pdf.addImage(dataUrl, 'PNG', (210 - w) / 2, 9, w, h);
  return pdf.output('blob');
}

/** Normalize a Saudi number to wa.me format, or null when unusable. */
export function normalizeWaNumber(raw: string): string | null {
  const d = (raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('966') && d.length >= 12) return d;
  if (d.startsWith('05') && d.length >= 10) return `966${d.slice(1)}`;
  if (d.startsWith('5') && d.length === 9) return `966${d}`;
  return null;
}

export type ShareOutcome = 'shared' | 'downloaded+chat' | 'downloaded';

/**
 * Share the PDF file directly when the platform allows it, otherwise
 * download it and (when a number is known) open the WhatsApp chat.
 * Resolves 'shared' only when the native share sheet completed.
 */
export async function sharePdf(opts: {
  blob: Blob;
  fileName: string;
  text: string;
  waNumber: string | null;
}): Promise<ShareOutcome> {
  const file = new File([opts.blob], opts.fileName, { type: 'application/pdf' });
  if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function') {
    try {
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: opts.fileName, text: opts.text });
        return 'shared';
      }
    } catch {
      // User cancelled or share failed — fall through to download.
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(opts.blob);
  a.download = opts.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  if (opts.waNumber) {
    window.open(`https://wa.me/${opts.waNumber}?text=${encodeURIComponent(opts.text)}`, '_blank');
    return 'downloaded+chat';
  }
  return 'downloaded';
}
