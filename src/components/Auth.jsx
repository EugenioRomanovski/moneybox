import { useState } from 'react';
import { supabase, errorText } from '../supabase.js';

const redirectTo = () => window.location.origin + window.location.pathname;

export default function Auth({ recovery = false, onRecovered }) {
  const [mode, setMode] = useState(recovery ? 'recover' : 'signin'); // signin | signup | reset | recover
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { display_name: name.trim() }, emailRedirectTo: redirectTo() },
        });
        if (error) throw error;
        if (!data.session) setMsg({ ok: true, text: 'Мы отправили письмо для подтверждения. Откройте ссылку из письма, затем войдите.' });
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() });
        if (error) throw error;
        setMsg({ ok: true, text: 'Ссылка для сброса пароля отправлена на почту.' });
      } else if (mode === 'recover') {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        onRecovered?.();
      }
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const titles = {
    signin: ['Вход', 'Войти'],
    signup: ['Регистрация', 'Создать аккаунт'],
    reset: ['Сброс пароля', 'Отправить ссылку'],
    recover: ['Новый пароль', 'Сохранить пароль'],
  };

  return (
    <div className="auth">
      <img className="logo" src="icon.svg" alt="" />
      <h1>Moneybox</h1>
      <p className="lead">Дневной лимит трат, регулярные платежи и общий бюджет семьи</p>

      <form className="card glass" onSubmit={submit}>
        <h2 style={{ margin: '2px 4px 14px', fontSize: 20 }}>{titles[mode][0]}</h2>
        {mode === 'signup' && (
          <label className="field">
            <span>Имя</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Как вас называть" autoComplete="name" maxLength={60} />
          </label>
        )}
        {mode !== 'recover' && (
          <label className="field">
            <span>Почта</span>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" inputMode="email" />
          </label>
        )}
        {mode !== 'reset' && (
          <label className="field">
            <span>Пароль</span>
            <input className="input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Минимум 6 символов" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
          </label>
        )}
        {msg && <p className={`msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</p>}
        <button className="btn" disabled={busy} type="submit" style={{ marginTop: 8 }}>
          {busy ? <span className="spinner" style={{ width: 20, height: 20, borderTopColor: '#fff' }} /> : titles[mode][1]}
        </button>
      </form>

      {mode === 'signin' && (
        <>
          <button className="link" type="button" onClick={() => { setMode('signup'); setMsg(null); }}>Нет аккаунта? Зарегистрироваться</button>
          <button className="link" type="button" onClick={() => { setMode('reset'); setMsg(null); }}>Забыли пароль?</button>
        </>
      )}
      {(mode === 'signup' || mode === 'reset') && (
        <button className="link" type="button" onClick={() => { setMode('signin'); setMsg(null); }}>Уже есть аккаунт? Войти</button>
      )}
    </div>
  );
}
