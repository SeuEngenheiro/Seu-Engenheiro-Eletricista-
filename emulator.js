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

━━━━━━━━━━━━━━━━━━━━━━━━
✅ Pronto pra começar? Assine um plano agora.`;

const REGEX_PLANOS = /\b(ver\s+planos|planos|quanto\s+custa|qual\s+o\s+valor|qual\s+o\s+pre[çc]o|quero\s+assinar|assinar(\s+plano)?|upgrade|contratar|valores|precos|preços)\b/i;

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

        // Bypass do LLM pra perguntas sobre planos — resposta fixa garante
        // que os links nunca sejam alterados pelo modelo
        if (REGEX_PLANOS.test(mensagem)) {
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
