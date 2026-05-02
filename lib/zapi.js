const ZAPI_BASE = `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}`;
const CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;

export async function enviarMensagem(telefone, mensagem) {
  try {
    // Z-API aceita no máximo 4096 caracteres por mensagem.
    // Limite 3500 dá margem segura. dividirMensagem busca ponto natural
    // de quebra (\n\n → \n → ". " → " ") em vez de cortar no meio.
    const partes = dividirMensagem(mensagem, 3500);

    // Log se quebrou — útil pra debug de respostas longas
    if (partes.length > 1) {
      console.log(`[ZAPI] msg longa quebrada em ${partes.length} partes (${mensagem.length} chars)`);
    }

    for (const parte of partes) {
      const res = await fetch(`${ZAPI_BASE}/send-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Token': CLIENT_TOKEN
        },
        body: JSON.stringify({
          phone: telefone,
          message: parte
        })
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Z-API error: ${err}`);
      }

      // Pequena pausa entre mensagens divididas
      if (partes.length > 1) await sleep(500);
    }

    console.log(`[ZAPI] Mensagem enviada para ${telefone}`);

  } catch (err) {
    console.error('[ZAPI ERROR]', err);
    throw err;
  }
}

export async function enviarDocumento(telefone, urlDocumento, nomeArquivo) {
  try {
    const res = await fetch(`${ZAPI_BASE}/send-document/pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': CLIENT_TOKEN
      },
      body: JSON.stringify({
        phone: telefone,
        document: urlDocumento,
        fileName: nomeArquivo
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Z-API PDF error: ${err}`);
    }

    console.log(`[ZAPI] PDF enviado para ${telefone}: ${nomeArquivo}`);

  } catch (err) {
    console.error('[ZAPI PDF ERROR]', err);
    throw err;
  }
}

/**
 * Divide texto longo em chunks que cabem no limite do Z-API (4096 chars).
 * Procura ponto de quebra natural em ordem de preferência:
 *   1. \n\n (parágrafo)  ← melhor — preserva blocos lógicos
 *   2. \n   (linha)
 *   3. ". " (frase)
 *   4. " "  (palavra)    ← último recurso
 *
 * Cada chunk é trim() e o limite default é 3500 (margem segura abaixo
 * dos 4096 do Z-API).
 *
 * Sprint 2.1 (02/05/2026): refatoração — antes só procurava \n e
 * cortava no meio da palavra como fallback.
 */
export function dividirMensagem(texto, limite = 3500) {
  if (!texto || texto.length <= limite) return [texto];

  const partes = [];
  let restante = texto;

  while (restante.length > limite) {
    let pontoCorte = -1;

    // Tenta cortar em ponto natural — exige que esteja na 2ª metade
    // do chunk (senão corta cedo demais e gera muitos chunks pequenos).
    const minCorte = Math.floor(limite * 0.5);
    const candidatos = [
      restante.lastIndexOf('\n\n', limite),
      restante.lastIndexOf('\n', limite),
      restante.lastIndexOf('. ', limite),
      restante.lastIndexOf(' ', limite),
    ];

    for (const c of candidatos) {
      if (c >= minCorte) { pontoCorte = c; break; }
    }

    // Fallback: nenhum ponto natural — corta no limite duro
    if (pontoCorte < 0) pontoCorte = limite;

    partes.push(restante.slice(0, pontoCorte).trim());
    restante = restante.slice(pontoCorte).trim();
  }

  if (restante.length > 0) partes.push(restante);
  return partes;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function enviarBotoes(telefone, mensagem, botoes) {
  const ZAPI_BASE = `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}`;
  const CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;

  const res = await fetch(`${ZAPI_BASE}/send-button-list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': CLIENT_TOKEN },
    body: JSON.stringify({
      phone: telefone,
      message: mensagem,
      buttonList: {
        buttons: botoes.map(b => ({ id: b.id, label: b.text }))
      }
    })
  });

  if (!res.ok) throw new Error(`Z-API buttons error: ${await res.text()}`);
}
