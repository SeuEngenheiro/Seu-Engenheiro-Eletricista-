
const ZAPI_BASE = `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}`;
const CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;

export async function enviarMensagem(telefone, mensagem) {
  const partes = mensagem.length <= 4000 ? [mensagem] : [mensagem.slice(0, 4000), mensagem.slice(4000)];
  for (const parte of partes) {
    const res = await fetch(`${ZAPI_BASE}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': CLIENT_TOKEN },
      body: JSON.stringify({ phone: telefone, message: parte })
    });
    if (!res.ok) throw new Error(`Z-API error: ${await res.text()}`);
  }
}
