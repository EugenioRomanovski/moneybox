import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  // implicit flow: the sign-in link from the letter works even when opened in another browser
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: 'moneybox-auth' },
});

const MESSAGES = {
  family_not_found: 'Семья с таким ID не найдена. Проверьте код.',
  alone_in_family: 'Вы единственный участник — выходить некуда.',
  owner_only: 'Это может сделать только владелец семьи.',
  cannot_remove_self: 'Нельзя удалить самого себя.',
  not_a_member: 'Этот человек уже не в семье.',
  'Signups not allowed': 'Регистрация новых пользователей отключена.',
  'Email address': 'Проверьте адрес почты.',
  'Error sending': 'Не удалось отправить письмо, попробуйте позже.',
  'Failed to fetch': 'Нет соединения с сервером.',
};

export function errorText(err) {
  const msg = err?.message || String(err || 'Ошибка');
  for (const [k, v] of Object.entries(MESSAGES)) if (msg.includes(k)) return v;
  const wait = msg.match(/after (\d+) seconds/);
  if (wait) return `Новый код можно запросить через ${wait[1]} с.`;
  if (/rate limit/i.test(msg)) return 'Слишком много писем подряд, попробуйте чуть позже.';
  return msg;
}

/** Throws on a Supabase error, returns data otherwise. */
export async function q(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}
