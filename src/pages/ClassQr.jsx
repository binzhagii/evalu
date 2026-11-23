// QR code per class: students scan it in the classroom; after signing in, that class's evaluation opens.
// The QR only holds a link (it gives no access by itself): students still sign in, and only students
// on the class list have an evaluation to open.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useApp } from '../lib/store';
import { userById, periodCovers, inTerm } from '../lib/logic';

const BASE_KEY = 'evalu-qr-base';
const readBase = () => { try { return localStorage.getItem(BASE_KEY) || window.location.origin; } catch { return window.location.origin; } };
export const classLink = (base, sectionId) => `${base.replace(/\/+$/, '')}/?evaluate=${encodeURIComponent(sectionId)}`;
const isLocal = (base) => /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(base);

/** One printable card: what to evaluate, the QR code, and three steps. */
function QrCard({ section, base, db }) {
  const [svg, setSvg] = useState('');
  const link = classLink(base, section.id);
  useEffect(() => {
    let live = true;
    QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then((s) => { if (live) setSvg(s); }).catch(() => setSvg(''));
    return () => { live = false; };
  }, [link]);
  const teacher = userById(db, section.facultyId)?.name || '';
  const open = db.periods.find((p) => p.status === 'open' && periodCovers(p, section.dept) && inTerm(p, section));
  return (
    <div className="qr-card">
      <img src="/ub-logo.png" alt="University of Baguio" className="qr-logo" />
      <div className="qr-title">Evaluate your teacher</div>
      <div className="qr-class"><b>{section.subject}</b><span>{section.code} · {teacher}</span></div>
      <div className="qr-code" dangerouslySetInnerHTML={{ __html: svg }} />
      <ol className="qr-steps">
        <li>Scan this code with your phone's camera.</li>
        <li>Sign in with your student ID or UB email.</li>
        <li>Answer every question and submit.</li>
      </ol>
      <div className="qr-foot">{open ? `Open until ${new Date(open.deadline + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}` : 'Evaluation not open yet'} · Your answers are anonymous.</div>
      <div className="qr-link">{link}</div>
    </div>
  );
}

/** Full-screen sheet with the QR cards of the given classes, with Print and Close. */
export function QrSheet({ sections, onClose }) {
  const { db } = useApp();
  const [base, setBase] = useState(readBase);
  const save = (v) => { setBase(v); try { localStorage.setItem(BASE_KEY, v); } catch { /* not saved in this browser */ } };
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="qr-overlay" role="dialog" aria-modal="true" aria-label="QR codes">
      <div className="qr-bar no-print">
        <b>QR code{sections.length > 1 ? `s (${sections.length} classes)` : ''}</b>
        <label className="inline">Address students will open <input className="wide" value={base} onChange={(e) => save(e.target.value.trim())} /></label>
        <button onClick={() => window.print()}>Print</button>
        <button className="ghost" onClick={onClose}>Close</button>
      </div>
      {isLocal(base) && <div className="note warn no-print">Phones can't open "localhost". Type this computer's network address (for example http://192.168.1.15:3000) or your evalU web address, so the QR code works on students' phones.</div>}
      <div className="qr-grid">{sections.map((s) => <QrCard key={s.id} section={s} base={base} db={db} />)}</div>
    </div>
  );
}

/** Small button that opens the QR sheet for some classes. */
export function QrButton({ sections, label = 'QR code', className = 'ghost' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} disabled={!sections.length} onClick={() => setOpen(true)}>{label}</button>
      {open && <QrSheet sections={sections} onClose={() => setOpen(false)} />}
    </>
  );
}

/** After sign-in, the class a student scanned (if any): read once, then forgotten. */
export const QR_KEY = 'evalu-open-class';
export function takeScannedClass() {
  try { const id = sessionStorage.getItem(QR_KEY); sessionStorage.removeItem(QR_KEY); return id; } catch { return null; }
}
