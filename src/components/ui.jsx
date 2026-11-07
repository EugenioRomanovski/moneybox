import { useEffect, useRef, useState, createContext, useContext, useCallback } from 'react';

/* ───────── bottom sheet with drag-to-dismiss ───────── */
export function Sheet({ open, onClose, title, left, right, children }) {
  const [render, setRender] = useState(open);
  const [closing, setClosing] = useState(false);
  const ref = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    if (open) { setRender(true); setClosing(false); }
    else if (render) {
      setClosing(true);
      const t = setTimeout(() => { setRender(false); setClosing(false); }, 250);
      return () => clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!render) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [render, onClose]);

  if (!render) return null;

  const onStart = (e) => {
    if (ref.current.scrollTop > 0) return;
    drag.current = { y: e.touches[0].clientY, dy: 0 };
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const dy = Math.max(0, e.touches[0].clientY - drag.current.y);
    drag.current.dy = dy;
    ref.current.style.transform = `translateY(${dy}px)`;
    ref.current.style.transition = 'none';
  };
  const onEnd = () => {
    if (!drag.current) return;
    const { dy } = drag.current;
    drag.current = null;
    ref.current.style.transition = 'transform 0.3s cubic-bezier(.2,.9,.25,1)';
    if (dy > 110) { ref.current.style.setProperty('--drag', `${dy}px`); ref.current.style.transform = ''; onClose?.(); }
    else ref.current.style.transform = '';
  };

  return (
    <>
      <div className={`sheet-backdrop${closing ? ' closing' : ''}`} onClick={onClose} />
      <div ref={ref} className={`sheet glass${closing ? ' closing' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>
          <div className="grabber" />
          <div className="sheet-head">
            {left ?? <button className="circle-btn" onClick={onClose} aria-label="Закрыть">✕</button>}
            <h2>{title}</h2>
            {right ?? <span className="spacer" />}
          </div>
        </div>
        {children}
      </div>
    </>
  );
}

/* ───────── toast ───────── */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const show = useCallback((text, kind = 'info') => {
    clearTimeout(timer.current);
    setToast({ text, kind, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div key={toast.id} className={`toast glass ${toast.kind === 'error' ? 'danger' : ''}`} role="status" onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

/* ───────── keypad for amounts ───────── */
export function useAmount(initial = '') {
  const [value, setValue] = useState(initial);
  const press = (k) => {
    setValue((v) => {
      if (k === 'del') return v.slice(0, -1);
      if (k === ',') return v.includes(',') ? v : (v || '0') + ',';
      if (v.includes(',') && v.split(',')[1].length >= 2) return v;
      if (v === '0') return k;
      if (v.replace(',', '').length >= 9) return v;
      return v + k;
    });
  };
  const number = Number(value.replace(',', '.')) || 0;
  return { value, setValue, press, number };
}

export function Keypad({ onPress }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'];
  return (
    <div className="keypad">
      {keys.map((k) => (
        <button key={k} type="button" className="key" onClick={() => { navigator.vibrate?.(5); onPress(k); }} aria-label={k === 'del' ? 'Стереть' : k}>
          {k === 'del' ? '⌫' : k}
        </button>
      ))}
    </div>
  );
}

export function AmountDisplay({ value, currencySymbol }) {
  const [int, frac] = (value || '0').split(',');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (frac !== undefined ? `,${frac}` : '');
  return (
    <div className={`amount-display${value ? '' : ' placeholder'}`} aria-live="polite">
      {grouped}<span className="cur">{currencySymbol}</span>
    </div>
  );
}

export function Switch({ checked, onChange, label }) {
  return (
    <label className="switch" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function Segmented({ value, options, onChange }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name = '?', url, size = 36 }) {
  const colors = ['#FF9F0A', '#30B0C7', '#5E5CE6', '#34C759', '#FF375F', '#BF5AF2', '#0A84FF'];
  const c = colors[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % colors.length];
  return (
    <span className="avatar" style={{ width: size, height: size, background: url ? `center/cover url("${url}")` : c }}>
      {url ? '' : name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function currencySymbol(cur) {
  try {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find((p) => p.type === 'currency')?.value || cur;
  } catch { return cur; }
}
