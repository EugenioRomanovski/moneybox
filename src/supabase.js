import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'moneybox-auth' },
});

const MESSAGES = {
  family_not_found: 'Семья с таким ID не найдена. Проверьте код.',
  alone_in_family: 'Вы единственный участник — выходить некуда.',
  owner_only: 'Это может сделать только владелец семьи.',
  cannot_remove_self: 'Нельзя удалить самого себя.',
  not_a_member: 'Этот человек уже не в семье.',
  'Invalid login credentials': 'Неверная почта или пароль.',
  'Email not confirmed': 'Почта не подтверждена — откройте письмо со ссылкой.',
  'User already registered': 'Такой пользователь уже зарегистрирован — войдите.',
  'Failed to fetch': 'Нет соединения с сервером.',
};

export function errorText(err) {
  const msg = err?.message || String(err || 'Ошибка');
  for (const [k, v] of Object.entries(MESSAGES)) if (msg.includes(k)) return v;
  if (/Password should be at least/i.test(msg)) return 'Пароль слишком короткий (минимум 6 символов).';
  if (/rate limit/i.test(msg)) return 'Слишком много попыток, попробуйте позже.';
  return msg;
}

/** Throws on a Supabase error, returns data otherwise. */
export async function q(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}
