import { useState } from 'react';
import { supabase, errorText, q } from '../supabase.js';
import { Sheet, Segmented, Avatar, useToast } from './ui.jsx';
import { formatCode, CURRENCIES } from '../lib/format.js';

export default function Family({ family, members, user, profileName, onFamily, onProfileName, reload }) {
  const toast = useToast();
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [famName, setFamName] = useState(family.name);
  const [meOpen, setMeOpen] = useState(false);
  const [myName, setMyName] = useState(profileName);
  const isOwner = family.role === 'owner';
  const shareText = `Присоединяйся к нашей семье в Moneybox. ID семьи: ${formatCode(family.code)}`;

  const run = async (fn, okText) => {
    setBusy(true);
    try {
      await fn();
      if (okText) toast(okText);
      return true;
    } catch (err) {
      toast(errorText(err), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const update = (patch) => run(async () => onFamily(await q(supabase.rpc('mb_update_family', patch))));

  const copy = async () => {
    try { await navigator.clipboard.writeText(family.code); toast('ID семьи скопирован'); } catch { toast(formatCode(family.code)); }
  };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'Moneybox', text: shareText }); } catch { /* cancelled */ } }
    else copy();
  };

  const join = async () => {
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length !== 10) { toast('ID семьи — 10 символов', 'error'); return; }
    const alone = members.length <= 1;
    const warn = alone
      ? 'Ваши траты, доходы и платежи перейдут в новую семью и станут общими. Продолжить?'
      : 'Вы выйдете из текущей семьи (её история останется у других участников). Продолжить?';
    if (!confirm(warn)) return;
    const ok = await run(async () => onFamily(await q(supabase.rpc('mb_join_family', { p_code: clean }))), 'Вы присоединились к семье');
    if (ok) { setJoinOpen(false); setCode(''); }
  };

  const leave = () => {
    if (!confirm('Покинуть семью? Общая история останется у остальных, а у вас начнётся новый личный бюджет.')) return;
    run(async () => onFamily(await q(supabase.rpc('mb_leave_family'))), 'Вы вышли из семьи');
  };

  const removeMember = (m) => {
    if (!isOwner || m.is_me) return;
    if (!confirm(`Исключить ${m.display_name} из семьи?`)) return;
    run(async () => { await q(supabase.rpc('mb_remove_member', { p_user: m.user_id })); await reload(); }, 'Участник исключён');
  };

  const regenerate = () => {
    if (!confirm('Сгенерировать новый ID? Старый перестанет работать, участники останутся в семье.')) return;
    run(async () => onFamily(await q(supabase.rpc('mb_regenerate_code'))), 'Новый ID создан');
  };

  const saveMyName = () => run(async () => {
    const display_name = myName.trim().slice(0, 100);
    await q(supabase.from('profiles').upsert({ user_id: user.id, display_name }, { onConflict: 'user_id' }));
    onProfileName(display_name);
    await reload();
    setMeOpen(false);
  }, 'Имя сохранено');

  return (
    <div className="screen">
      <header className="nav">
        <div>
          <h1>Семья</h1>
          <div className="sub">Общий бюджет по ID семьи</div>
        </div>
      </header>

      <section className="card glass" style={{ textAlign: 'center' }}>
        <button style={{ fontSize: 22, fontWeight: 700 }} onClick={() => { setFamName(family.name); setNameOpen(true); }}>{family.name} <span className="muted" style={{ fontSize: 15 }}>✎</span></button>
        <div className="muted" style={{ fontSize: 13, margin: '10px 0 2px' }}>ID семьи</div>
        <div className="family-code">{formatCode(family.code)}</div>
        <div className="btn-row">
          <button className="btn secondary small" onClick={copy}>Скопировать</button>
          <button className="btn small" onClick={share}>Поделиться</button>
        </div>
        <p className="footnote" style={{ margin: '12px 0 0' }}>Передайте ID близким: после ввода кода у вас будут общие траты, доходы, платежи и один дневной лимит.</p>
      </section>

      <div className="section-title"><span>Участники · {members.length}</span></div>
      <div className="list glass">
        {members.map((m) => (
          <button className="row" key={m.user_id} onClick={() => (m.is_me ? (setMyName(profileName), setMeOpen(true)) : removeMember(m))}>
            <Avatar name={m.display_name} url={m.avatar_url} />
            <div className="main">
              <div className="title">{m.display_name}{m.is_me ? ' (вы)' : ''}</div>
              <div className="subtitle">{m.email}</div>
            </div>
            {m.role === 'owner' && <span className="badge">владелец</span>}
          </button>
        ))}
      </div>

      <div className="list glass" style={{ marginTop: 16 }}>
        <button className="row plain" onClick={() => setJoinOpen(true)}>
          <div className="main"><div className="title blue">Присоединиться по ID семьи</div></div>
          <span className="chev">›</span>
        </button>
        {isOwner && (
          <button className="row plain" onClick={regenerate} disabled={busy}>
            <div className="main"><div className="title blue">Сгенерировать новый ID</div></div>
          </button>
        )}
        {members.length > 1 && (
          <button className="row plain" onClick={leave} disabled={busy}>
            <div className="main"><div className="title danger">Покинуть семью</div></div>
          </button>
        )}
      </div>

      <div className="section-title"><span>Настройки бюджета</span></div>
      <div className="list glass">
        <label className="row plain">
          <div className="main"><div className="title">Валюта</div></div>
          <select className="input" style={{ width: 'auto' }} value={family.currency} onChange={(e) => update({ p_currency: e.target.value })}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="row plain">
          <div className="main"><div className="title">Начало периода</div><div className="subtitle">День зарплаты</div></div>
          <select className="input" style={{ width: 'auto' }} value={family.period_start_day} onChange={(e) => update({ p_period_start_day: Number(e.target.value) })}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}-е число</option>)}
          </select>
        </label>
        <div className="row plain" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <div className="title">Если потратил больше лимита</div>
          <Segmented value={family.overspend_mode} onChange={(v) => update({ p_overspend_mode: v })}
            options={[{ value: 'next_day', label: 'Вычесть из завтра' }, { value: 'spread', label: 'Растянуть на период' }]} />
        </div>
      </div>
      <p className="footnote">Неистраченный остаток дня всегда переходит на следующий день. Перерасход можно вычесть целиком из завтрашнего лимита или распределить по оставшимся дням.</p>

      <div className="section-title"><span>Аккаунт</span></div>
      <div className="list glass">
        <button className="row plain" onClick={() => { setMyName(profileName); setMeOpen(true); }}>
          <div className="main"><div className="title">{profileName || 'Ваше имя'}</div><div className="subtitle">{user.email}</div></div>
          <span className="chev">›</span>
        </button>
        <button className="row plain" onClick={() => confirm('Выйти из аккаунта?') && supabase.auth.signOut()}>
          <div className="main"><div className="title danger">Выйти</div></div>
        </button>
      </div>

      <Sheet open={joinOpen} onClose={() => setJoinOpen(false)} title="Присоединиться">
        <p className="footnote" style={{ margin: '4px 4px 14px', textAlign: 'center' }}>Введите ID семьи, который вам прислали</p>
        <input className="input code" value={code} autoFocus maxLength={14} placeholder="XXXXX-XXXXX"
          onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" spellCheck={false} />
        <button className="btn" style={{ marginTop: 14 }} disabled={busy} onClick={join}>Присоединиться</button>
      </Sheet>

      <Sheet open={nameOpen} onClose={() => setNameOpen(false)} title="Название семьи">
        <input className="input" value={famName} maxLength={60} onChange={(e) => setFamName(e.target.value)} />
        <button className="btn" style={{ marginTop: 14 }} disabled={busy || !famName.trim()}
          onClick={async () => { if (await update({ p_name: famName.trim() })) setNameOpen(false); }}>Сохранить</button>
      </Sheet>

      <Sheet open={meOpen} onClose={() => setMeOpen(false)} title="Ваше имя">
        <input className="input" value={myName} maxLength={100} onChange={(e) => setMyName(e.target.value)} placeholder="Имя" />
        <p className="footnote" style={{ margin: '8px 4px 14px' }}>Имя видят участники семьи. Профиль общий для всех приложений.</p>
        <button className="btn" disabled={busy || !myName.trim()} onClick={saveMyName}>Сохранить</button>
      </Sheet>
    </div>
  );
}
