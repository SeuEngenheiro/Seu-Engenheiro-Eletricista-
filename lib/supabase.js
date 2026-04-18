import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } },
);

const TABLE = 'messages';
const HISTORY_LIMIT = 20;

export async function loadHistory(phone) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('role, content, created_at')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) throw error;

  return (data ?? [])
    .reverse()
    .map(({ role, content }) => ({ role, content }));
}

export async function saveMessage(phone, role, content) {
  const { error } = await supabase
    .from(TABLE)
    .insert({ phone, role, content });

  if (error) throw error;
}
