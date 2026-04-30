import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chamarClaude } from './lib/claude.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const HTML_PATH = join(__dirname, 'emulator.html');

// Resposta fixa de planos — bypassa o LLM (mais rápido, sem risco de
// mexer nos links). Mesma lógica que o webhook.js usa em produção.
const MSG_PLANOS = `📊 *Planos — Seu Engenheiro AI*

━━━━━━━━━━━━━━━━━━━━━━━━
🟢 *Plano Gratuito — R$ 0*
• 20 perguntas / mês
• Resposta técnica padrão (modo curto)
• Direcionamento conforme NBR 5410

Indicado pra dúvidas simples e consultas rápidas.

━━━━━━━━━━━━━━━━━━━━━━━━
🔵 *Plano Profissional — R$ 24,99/mês*
• Perguntas ilimitadas
• Cálculos ilimitados
• Dimensionamento detalhado
• Lista de materiais (SEM PREÇOS)
• Especificação técnica de materiais

Indicado pra quem executa serviços.

👉 https://pay.kiwify.com.br/mVAGqLU

━━━━━━━━━━━━━━━━━━━━━━━━
🔴 *Plano Premium — R$ 49,99/mês*
• Tudo do Profissional
• 💰 Lista de materiais (COM PREÇOS)
• 📷 Análise de fotos ilimitada
• 📜 Histórico completo acessível
• 🏗️ Análise de projeto (fotos + planta)

Indicado pra uso profissional e projetos.

👉 https://pay.kiwify.com.br/Mns2lfH

*✅ Pronto pra começar? Assine um plano agora.*`;

// Detecção CONTEXTUAL — evita falso positivo em "qual o valor da resistência"
function isPergPlanos(msg) {
  return (
    /^plan[oa]s?[!?.,;:\s]*$/i.test(msg) ||
    /\bver\s+planos?\b/i.test(msg) ||
    /\bmostra(r)?\s+(os\s+)?planos?\b/i.test(msg) ||
    /\bquero\s+(assinar|contratar|fazer\s+upgrade)\b/i.test(msg) ||
    /\bassinar\s+(o\s+|um\s+)?(plano|profissional|premium)\b/i.test(msg) ||
    /\bfazer\s+upgrade\b/i.test(msg) ||
    /\bcontratar\s+(o\s+|um\s+)?(plano|servi[çc]o|seu)\b/i.test(msg) ||
    /\bquanto\s+custa\s+(o\s+plano|a\s+assinatura|cada\s+plano|os\s+planos?|profissional|premium|p(ra|ara)\s+(assinar|usar))\b/i.test(msg) ||
    /\bvalores?\s+dos?\s+planos?\b/i.test(msg) ||
    /\bpre[çc]os?\s+(do|dos|da|de)\s+(plano|assinatura)\b/i.test(msg)
  );
}

const REGEX_PLANO_ATUAL = /\b(meu\s+plano|plano\s+atual|qual\s+(é|e|o|eh)\s+(o\s+)?meu\s+plano|que\s+plano\s+(eu\s+)?(tenho|uso|estou)|estou\s+(em\s+|no\s+)?(qual\s+)?plano|verificar\s+(o\s+)?(meu\s+)?plano|ver\s+meu\s+plano|saber\s+(o\s+)?meu\s+plano)\b/i;

// Agradecimentos / despedidas curtas
// IMPORTANTE: usa ([!?.,\s]|$) em vez de \b porque \b não trata acentos.
const REGEX_AGRADECIMENTO = /^(obrigad[oa]|obg|valeu|vlw|tmj|tudo\s+bem|tudo\s+ok|brigad[oa]|tks|thank[ys]?|legal|bele[zs]a|tranquilo|certo|entendi|perfeito|massa|excelente|ot[ií]mo)([!?.,;:\s]|$)/i;
const MSG_AGRADECIMENTO = `🤝 Por nada! Se precisar de mais alguma coisa elétrica, é só chamar.`;

// Conversões simples (CV/kW/HP)
function tentarConversao(msg) {
  let m = msg.match(/(\d+(?:[.,]\d+)?)\s*cv\s+(em|para|=>?)\s*kw/i);
  if (m) { const v = parseFloat(m[1].replace(',', '.')); return `✅ ${v} CV = ${(v*0.736).toFixed(2)} kW (× 0,736)`; }
  m = msg.match(/(\d+(?:[.,]\d+)?)\s*kw\s+(em|para|=>?)\s*cv/i);
  if (m) { const v = parseFloat(m[1].replace(',', '.')); return `✅ ${v} kW = ${(v/0.736).toFixed(2)} CV (÷ 0,736)`; }
  m = msg.match(/(\d+(?:[.,]\d+)?)\s*hp\s+(em|para|=>?)\s*cv/i);
  if (m) { const v = parseFloat(m[1].replace(',', '.')); return `✅ ${v} HP = ${(v*1.0139).toFixed(2)} CV (× 1,0139)`; }
  m = msg.match(/(\d+(?:[.,]\d+)?)\s*cv\s+(em|para|=>?)\s*hp/i);
  if (m) { const v = parseFloat(m[1].replace(',', '.')); return `✅ ${v} CV = ${(v*0.9863).toFixed(2)} HP (× 0,9863)`; }
  m = msg.match(/(\d+(?:[.,]\d+)?)\s*kw\s+(em|para|=>?)\s*hp/i);
  if (m) { const v = parseFloat(m[1].replace(',', '.')); return `✅ ${v} kW = ${(v*1.341).toFixed(2)} HP (× 1,341)`; }
  m = msg.match(/(\d+(?:[.,]\d+)?)\s*hp\s+(em|para|=>?)\s*kw/i);
  if (m) { const v = parseFloat(m[1].replace(',', '.')); return `✅ ${v} HP = ${(v*0.7457).toFixed(2)} kW (× 0,7457)`; }
  return null;
}

function montarPlanoAtual(plano) {
  if (plano === 'premium') {
    return `📊 *Seu plano atual: 🔴 PREMIUM*\n\n✅ Acesso total liberado — sem limites:\n• Perguntas ilimitadas\n• 📷 Análise de fotos (até 30/dia)\n• 💰 Lista com preços atualizados\n• 📜 Histórico completo\n• 🏗️ Análise de projeto\n\nAproveite!`;
  }
  if (plano === 'pro') {
    return `📊 *Seu plano atual: 🔵 PROFISSIONAL*\n\n✅ Recursos ativos:\n• Perguntas ilimitadas\n• Cálculo passo a passo\n• Dimensionamento detalhado\n• Lista de materiais (sem preços)\n• Especificação técnica\n\n💡 Quer fotos + preços atualizados + histórico + análise de projeto?\n🔴 Faça upgrade pro *PREMIUM* (R$ 49,99/mês):\n👉 https://pay.kiwify.com.br/Mns2lfH`;
  }
  return `📊 *Seu plano atual: 🟢 GRATUITO*\n\n• 20 perguntas/mês\n• Resposta técnica padrão\n• Direcionamento conforme NBR 5410\n\n💡 Quer perguntas ilimitadas + cálculos detalhados?\n🔵 *PROFISSIONAL* (R$ 24,99/mês):\n👉 https://pay.kiwify.com.br/mVAGqLU\n\n🔴 *PREMIUM* (R$ 49,99/mês):\n👉 https://pay.kiwify.com.br/Mns2lfH`;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    const html = readFileSync(HTML_PATH, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const { telefone, mensagem, plano } = JSON.parse(body);
        const inicio = Date.now();

        // Bypass: agradecimento (resposta instantânea)
        if (REGEX_AGRADECIMENTO.test(mensagem.trim())) {
          const ms = Date.now() - inicio;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ resposta: MSG_AGRADECIMENTO, ms }));
          return;
        }

        // Bypass: conversão simples (CV/kW/HP)
        const respConv = tentarConversao(mensagem);
        if (respConv) {
          const ms = Date.now() - inicio;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ resposta: respConv, ms }));
          return;
        }

        // Bypass do LLM — plano atual do usuário (vem ANTES do regex de planos)
        if (REGEX_PLANO_ATUAL.test(mensagem)) {
          const ms = Date.now() - inicio;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ resposta: montarPlanoAtual(plano || 'gratis'), ms }));
          return;
        }

        // Bypass do LLM pra perguntas sobre planos — resposta fixa garante
        // que os links nunca sejam alterados pelo modelo
        if (isPergPlanos(mensagem)) {
          const ms = Date.now() - inicio;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ resposta: MSG_PLANOS, ms }));
          return;
        }

        const resposta = await chamarClaude(telefone, mensagem, plano || 'gratis');
        const ms = Date.now() - inicio;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ resposta, ms }));
      } catch (err) {
        console.error('[CHAT ERROR]', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ erro: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n🟢 Emulador rodando em http://localhost:${PORT}\n`);
});
