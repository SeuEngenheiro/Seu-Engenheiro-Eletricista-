const BASE = () =>
  `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}`;

export async function sendText(phone, message) {
  const res = await fetch(`${BASE()}/send-text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Client-Token': process.env.ZAPI_CLIENT_TOKEN,
    },
    body: JSON.stringify({ phone, message }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Z-API send-text failed: ${res.status} ${body}`);
  }

  return res.json();
}

export function parseIncoming(payload) {
  if (!payload || payload.fromMe) return null;

  const phone = payload.phone;
  const text =
    payload.text?.message ??
    payload.message?.text ??
    payload.body ??
    null;

  if (!phone || !text) return null;

  return { phone, text: String(text).trim() };
}
