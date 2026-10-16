/**
 * ============================================================
 *  Share a report as PDF over WhatsApp via public link
 * ============================================================
 *  Flow: build a SELF-CONTAINED static HTML document (inline styles,
 *  data-URI images only — no app CSS, no external resources, so nothing
 *  can taint the canvas or fail to load) → render to canvas →
 *  A4 PDF → upload to the tenant store → open WhatsApp with a PUBLIC
 *  download link + summary. The recipient taps the link — no login,
 *  no manual attach, no typed number. Identical on mobile + desktop.
 * ============================================================
 */

import { toCanvas } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { api, API_BASE } from '../api/client';

const withTimeout = <T,>(p: Promise<T>, ms = 25000): Promise<T> =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('PDF_TIMEOUT')), ms))]);

async function canvasToPdfBlob(dataUrl: string): Promise<Blob> {
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

/**
 * Render a standalone HTML document (off-screen iframe, same-origin srcdoc)
 * to an A4 PDF blob. The document must be self-contained: inline styles +
 * data-URI images only.
 */
export async function staticPdfBlob(docHtml: string, timeoutMs = 30000): Promise<Blob> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);
  try {
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        iframe.onload = () => resolve();
        iframe.onerror = () => reject(new Error('IFRAME'));
        iframe.srcdoc = docHtml;
      }),
      timeoutMs
    );
    await new Promise(r => setTimeout(r, 500));
    const doc = iframe.contentDocument;
    const body = doc?.body;
    if (!body) throw new Error('IFRAME_BODY');
    let dataUrl: string;
    try {
      const canvas = await withTimeout(
        toCanvas(body, { pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true }),
        timeoutMs
      );
      dataUrl = canvas.toDataURL('image/png');
    } catch {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await withTimeout(
        html2canvas(body, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true }),
        timeoutMs
      );
      dataUrl = canvas.toDataURL('image/png');
    }
    return await canvasToPdfBlob(dataUrl);
  } finally {
    iframe.remove();
  }
}

/** Render a live report node to an A4 PDF blob (legacy path). */
export async function sheetPdfBlob(el: HTMLElement, timeoutMs = 25000): Promise<Blob> {
  let dataUrl: string;
  try {
    const canvas = await withTimeout(
      toCanvas(el, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true, skipFonts: true }),
      timeoutMs
    );
    dataUrl = canvas.toDataURL('image/png');
  } catch {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await withTimeout(
      html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true }),
      timeoutMs
    );
    dataUrl = canvas.toDataURL('image/png');
  }
  return canvasToPdfBlob(dataUrl);
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

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/**
 * Hand the PDF to the platform share sheet (mobile AND desktop): WhatsApp
 * appears among the targets when installed, the user picks a contact there,
 * and the FILE goes with it — no downloads, no typed numbers.
 * Falls back to a plain download only where share sheets don't exist.
 */
export async function sharePdf(opts: {
  blob: Blob;
  fileName: string;
  text: string;
}): Promise<ShareOutcome> {
  const file = new File([opts.blob], opts.fileName, { type: 'application/pdf' });
  const nav = (typeof navigator !== 'undefined' ? navigator : null) as
    | (Navigator & { share(d?: { files?: File[]; title?: string; text?: string }): Promise<void> })
    | null;
  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ files: [file], title: opts.fileName, text: opts.text });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(opts.blob);
  a.download = opts.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  return 'downloaded';
}

/**
 * Full WhatsApp-link flow: render the standalone document, upload it to the
 * tenant store, and open WhatsApp with a PUBLIC download link + summary.
 * Throws on any failure (caller toasts).
 */
export async function shareDocViaLink(opts: {
  docHtml: string;
  kind: 'lab' | 'delivery';
  ref: string;
  fileName: string;
  text: string;
}): Promise<string> {
  const blob = await staticPdfBlob(opts.docHtml);
  return publishBlob({
    blob,
    kind: opts.kind,
    ref: opts.ref,
    fileName: opts.fileName,
    text: opts.text,
  });
}

/** Upload any blob and open WhatsApp with its public link. Shared by PDF/image flows. */
export async function publishBlob(opts: {
  blob: Blob;
  kind: 'lab' | 'delivery';
  ref: string;
  fileName: string;
  text: string;
}): Promise<string> {
  const buf = new Uint8Array(await opts.blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)) as number[]);
  }
  const b64 = btoa(binary);
  const res = await api.post<{ token: string }>('/api/reports/publish', {
    kind: opts.kind,
    ref: opts.ref,
    fileName: opts.fileName,
    pdfBase64: b64,
  });
  if (!res?.token) throw new Error('SHARE_FAILED');
  const url = `${API_BASE}/api/public/reports/${res.token}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(`${opts.text}\n${url}`)}`, '_blank');
  return url;
}

/**
 * Render the standalone document to a JPEG image blob (light: ~10x smaller
 * than PDF — uploads fast and previews inline inside WhatsApp).
 */
export async function docImageBlob(docHtml: string, timeoutMs = 30000): Promise<Blob> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);
  try {
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        iframe.onload = () => resolve();
        iframe.onerror = () => reject(new Error('IFRAME'));
        iframe.srcdoc = docHtml;
      }),
      timeoutMs
    );
    await new Promise(r => setTimeout(r, 500));
    const doc = iframe.contentDocument;
    const body = doc?.body;
    if (!body) throw new Error('IFRAME_BODY');
    let canvas: HTMLCanvasElement;
    try {
      canvas = await withTimeout(
        toCanvas(body, { pixelRatio: 1.75, backgroundColor: '#ffffff', skipFonts: true }),
        timeoutMs
      );
    } catch {
      const html2canvas = (await import('html2canvas')).default;
      canvas = await withTimeout(
        html2canvas(body, { scale: 1.75, backgroundColor: '#ffffff', logging: false, useCORS: true }),
        timeoutMs
      );
    }
    const blob: Blob | null = await new Promise(resolve =>
      canvas.toBlob(b => resolve(b), 'image/jpeg', 0.88)
    );
    if (!blob) throw new Error('ENCODE');
    return blob;
  } finally {
    iframe.remove();
  }
}

/**
 * Image flow the owner asked for: the report preview becomes a JPEG that
 * uploads in seconds and shows as an inline preview inside WhatsApp.
 */
export async function shareImageViaLink(opts: {
  docHtml: string;
  kind: 'lab' | 'delivery';
  ref: string;
  fileName: string;
  text: string;
}): Promise<string> {
  const blob = await docImageBlob(opts.docHtml);
  return publishBlob({
    blob,
    kind: opts.kind,
    ref: opts.ref,
    fileName: opts.fileName,
    text: opts.text,
  });
}
