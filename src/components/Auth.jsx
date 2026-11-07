import { useEffect, useRef, useState } from 'react';
import { supabase, errorText } from '../supabase.js';

const redirectTo = () => window.location.origin + window.location.pathname;
const RESEND_AFTER = 60;
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

/**
 * Passwordless sign-in: the user enters an email, gets a letter with a one-time code and a
 * sign-in button. New users are created on the first sign-in, existing ones just sign in.
 */
export default function Auth() {
  const [step, setStep] = useState('email'); // email | code
  const [email, setEmail] = useState(() => localStorage.getItem('moneybox-email') || '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef(null);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => { if (step === 'code') codeRef.current?.focus(); }, [step]);

  // a link from an old/used letter lands here with an error in the URL hash
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    if (h.get('error')) {
      setMsg({ ok: false, text: h.get('error_code') === 'otp_expired' ? 'Ссылка устарела или уже использована. Запросите новый код.' : (h.get('error_description') || 'Не удалось войти по ссылке.') });
      history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const send = async (e) => {
    e?.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!addr) return;
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: addr,
        options: { shouldCreateUser: true, emailRedirectTo: redirectTo() },
      });
      if (error) throw error;
      localStorage.setItem('moneybox-email', addr);
      setEmail(addr);
      setCode('');
      setStep('code');
      setCooldown(RESEND_AFTER);
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value = code) => {
    const token = value.replace(/\D/g, '');
    if (token.length < 6 || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
      if (error) throw error;
      // onAuthStateChange in App switches to the main screen
    } catch (err) {
      setMsg({ ok: false, text: /expired|invalid/i.test(err?.message || '') ? 'Неверный или устаревший код. Проверьте письмо или запросите новый.' : errorText(err) });
      setBusy(false);
    }
  };

  const onCode = (v) => {
    const digits = v.replace(/\D/g, '').slice(0, 10);
    setCode(digits);
    // Supabase sends 6-digit codes by default; submit as soon as a full code is typed or pasted
    if (digits.length === 6 || digits.length === 8 || digits.length === 10) verify(digits);
  };

  return (
    <div className="auth">
      <img className="logo" src="icon.svg" alt="" />
      <h1>Moneybox</h1>
      <p className="lead">Дневной лимит трат, регулярные платежи и общий бюджет семьи</p>

      {step === 'email' ? (
        <form className="card glass" onSubmit={send}>
          <h2 style={{ margin: '2px 4px 6px', fontSize: 20 }}>Вход</h2>
          <p className="footnote" style={{ margin: '0 4px 14px' }}>
            Пароль не нужен — пришлём на почту код и кнопку для входа. Если аккаунта ещё нет, он будет создан.
          </p>
          <label className="field">
            <span>Почта</span>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} />
          </label>
          {msg && <p className={`msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</p>}
          <button className="btn" disabled={busy || !email.trim()} type="submit" style={{ marginTop: 8 }}>
            {busy ? <span className="spinner" style={{ width: 20, height: 20, borderTopColor: '#fff' }} /> : 'Получить код'}
          </button>
        </form>
      ) : (
        <form className="card glass" onSubmit={(e) => { e.preventDefault(); verify(); }}>
          <h2 style={{ margin: '2px 4px 6px', fontSize: 20 }}>Код из письма</h2>
          <p className="footnote" style={{ margin: '0 4px 14px' }}>
            Отправили письмо на <b style={{ color: 'var(--label)' }}>{email}</b>. Введите код из него
            {isStandalone() ? '.' : ' или нажмите кнопку входа в письме.'}
          </p>
          <input ref={codeRef} className="input code" value={code} onChange={(e) => onCode(e.target.value)}
            inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10}
            placeholder="••••••" aria-label="Код из письма" />
          {msg && <p className={`msg ${msg.ok ? 'ok' : 'err'}`} style={{ marginTop: 10 }}>{msg.text}</p>}
          <button className="btn" disabled={busy || code.length < 6} type="submit" style={{ marginTop: 14 }}>
            {busy ? <span className="spinner" style={{ width: 20, height: 20, borderTopColor: '#fff' }} /> : 'Войти'}
          </button>
          <button type="button" className="link" disabled={cooldown > 0 || busy} onClick={send}
            style={{ opacity: cooldown > 0 ? 0.5 : 1 }}>
            {cooldown > 0 ? `Отправить код ещё раз через ${cooldown} с` : 'Отправить код ещё раз'}
          </button>
          <button type="button" className="link" onClick={() => { setStep('email'); setMsg(null); }}>Другая почта</button>
        </form>
      )}

      {isStandalone() && step === 'code' && (
        <p className="footnote" style={{ textAlign: 'center', marginTop: 16 }}>
          Кнопка в письме откроет браузер, а не это приложение — поэтому здесь удобнее ввести код.
        </p>
      )}
    </div>
  );
}
