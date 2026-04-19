const ZAPI_BASE = `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}`;
const CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;

export async function enviarMensagem(telefone, mensagem) {
  try {
    // Z-API aceita no máximo 4096 caracteres por mensagem
    // Se for maior, divide em partes
    const partes = dividirMensagem(mensagem, 4000);

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

function dividirMensagem(texto, limite) {
  if (texto.length <= limite) return [texto];
  const partes = [];
  let inicio = 0;
  while (inicio < texto.length) {
    let fim = inicio + limite;
    if (fim < texto.length) {
      const quebra = texto.lastIndexOf('\n', fim);
      if (quebra > inicio) fim = quebra;
    }
    partes.push(texto.slice(inicio, fim));
    inicio = fim;
  }
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
