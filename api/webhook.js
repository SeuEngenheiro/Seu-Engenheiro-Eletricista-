import { askClaude } from '../lib/claude.js';
import { loadHistory, saveMessage } from '../lib/supabase.js';
import { sendText, parseIncoming } from '../lib/zapi.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'engenheiro-ai' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.WEBHOOK_SECRET;
  if (secret && req.query.secret !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const incoming = parseIncoming(req.body);
  if (!incoming) {
    return res.status(200).json({ ignored: true });
  }

  const { phone, text } = incoming;

  try {
    await saveMessage(phone, 'user', text);

    const history = await loadHistory(phone);
    const { text: reply } = await askClaude(history);

    await saveMessage(phone, 'assistant', reply);
    await sendText(phone, reply);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('webhook error', err);
    try {
      await sendText(
        phone,
        'Tive um problema técnico aqui do meu lado. Pode tentar de novo em instantes?',
      );
    } catch {
      /* swallow */
    }
    return res.status(500).json({ error: 'internal_error' });
  }
}
