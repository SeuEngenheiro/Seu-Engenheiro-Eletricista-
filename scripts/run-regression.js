#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/run-regression.js — Suíte de regressão Sprint 4
//
// Roda as 30 perguntas-teste de tests/regressao.json contra os
// bypasses, detector de dados faltantes e (opcionalmente) o LLM.
// Verifica deve_conter / nao_deve_conter / IB esperado / formato.
//
// USO:
//   node scripts/run-regression.js          → só bypasses (rápido, gratuito)
//   node scripts/run-regression.js --llm    → completo (~30s, ~R$0,15)
//   node scripts/run-regression.js --only=ID → roda só um caso
//
// EXIT CODE:
//   0 → todos passaram
//   1 → houve falhas (bloqueia deploy se usado em CI)
// ═══════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// No Windows, dynamic import precisa de URL file:// pra paths absolutos
const urlOf = (p) => pathToFileURL(p).href;

// Carrega .env de forma manual (sem depender de pacote dotenv).
// Necessário só pro modo --llm (que precisa OPENAI_API_KEY etc).
function carregarEnv(envPath) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf-8');
  for (const linha of content.split('\n')) {
    const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) {
      const [, k, v] = m;
      if (!process.env[k]) {
        process.env[k] = v.replace(/^["']|["']$/g, '');
      }
    }
  }
}
carregarEnv(join(ROOT, '.env'));

// Cores ANSI
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', gray: '\x1b[90m'
};

// Args
const args = process.argv.slice(2);
const incluirLLM = args.includes('--llm');
const onlyArg = args.find(a => a.startsWith('--only='));
const apenasId = onlyArg ? Number(onlyArg.split('=')[1]) : null;

// ─── Carrega casos ───────────────────────────────────────────────
const suite = JSON.parse(readFileSync(join(ROOT, 'tests/regressao.json'), 'utf-8'));
let casos = suite.casos;
if (apenasId) casos = casos.filter(c => c.id === apenasId);

// ─── Importa funções do bot ──────────────────────────────────────
const wh = await import(urlOf(join(ROOT, 'api/webhook.js')));
const { detectarDadosFaltantes } = await import(urlOf(join(ROOT, 'lib/dadosFaltantes.js')));

// LLM (importação lazy — só carrega se --llm)
let chamarClaude = null;
if (incluirLLM) {
  if (!process.env.OPENAI_API_KEY) {
    console.error(`${c.red}✗ OPENAI_API_KEY não definida — não dá pra rodar com --llm${c.reset}`);
    process.exit(1);
  }
  process.env.MODO_TESTE = 'true';
  const claudeMod = await import(urlOf(join(ROOT, 'lib/claude.js')));
  chamarClaude = claudeMod.chamarClaude;
}

// ─── Helpers de validação ───────────────────────────────────────

function contemTodos(texto, lista) {
  if (!Array.isArray(lista)) return { ok: true, faltando: [] };
  const t = texto.toLowerCase();
  const faltando = lista.filter(s => !t.includes(s.toLowerCase()));
  return { ok: faltando.length === 0, faltando };
}

function naoContemNenhum(texto, lista) {
  if (!Array.isArray(lista)) return { ok: true, presentes: [] };
  const t = texto.toLowerCase();
  const presentes = lista.filter(s => t.includes(s.toLowerCase()));
  return { ok: presentes.length === 0, presentes };
}

function extrairIB(texto) {
  // Tenta extrair "X A" como IB (preferindo "IB ≈ X A" ou "IB = X A")
  const labelMatch = texto.match(/IB\s*[≈=~:]?\s*(\d+(?:[,.]\d+)?)\s*A\b/i);
  if (labelMatch) return parseFloat(labelMatch[1].replace(',', '.'));
  // Fallback: primeiro "X A" plausível
  const m = texto.match(/(\d+(?:[,.]\d+)?)\s*A\b/);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

// ─── Executa um caso ────────────────────────────────────────────

async function executarCaso(caso) {
  const { id, tipo, pergunta } = caso;
  const inicio = Date.now();
  let resposta = null;
  let erro = null;

  try {
    if (tipo === 'bypass') {
      resposta = rodarBypass(pergunta);
    } else if (tipo === 'dados_faltantes') {
      const r = detectarDadosFaltantes(pergunta);
      resposta = r ? r.mensagemPergunta : null;
    } else if (tipo === 'llm') {
      if (!incluirLLM) return { id, skip: true, motivo: 'LLM desabilitado (use --llm)' };
      resposta = await chamarClaude('5519999999999', pergunta, 'gratis');
    } else {
      return { id, fail: true, motivo: `tipo desconhecido: ${tipo}` };
    }
  } catch (e) {
    erro = e?.message || String(e);
  }

  const tempoMs = Date.now() - inicio;

  if (erro) return { id, fail: true, motivo: `erro: ${erro}`, tempoMs };
  if (!resposta) return { id, fail: true, motivo: 'resposta vazia/nula', tempoMs };

  // Validações
  const falhas = [];
  const dc = contemTodos(resposta, caso.deve_conter);
  if (!dc.ok) falhas.push(`falta: [${dc.faltando.join(', ')}]`);

  const ndc = naoContemNenhum(resposta, caso.nao_deve_conter);
  if (!ndc.ok) falhas.push(`presente indevidamente: [${ndc.presentes.join(', ')}]`);

  if (caso.ib_esperado_min || caso.ib_esperado_max) {
    const ib = extrairIB(resposta);
    if (ib === null) {
      falhas.push('IB não extraído da resposta');
    } else {
      if (caso.ib_esperado_min && ib < caso.ib_esperado_min)
        falhas.push(`IB ${ib} < min ${caso.ib_esperado_min}`);
      if (caso.ib_esperado_max && ib > caso.ib_esperado_max)
        falhas.push(`IB ${ib} > max ${caso.ib_esperado_max}`);
    }
  }

  if (caso.bitola_esperada && !resposta.includes(caso.bitola_esperada)) {
    falhas.push(`bitola esperada '${caso.bitola_esperada}' não encontrada`);
  }

  return falhas.length > 0
    ? { id, fail: true, motivo: falhas.join(' | '), resposta, tempoMs }
    : { id, ok: true, tempoMs, resposta };
}

// ─── Roteador de bypasses ───────────────────────────────────────

function rodarBypass(msg) {
  const m = msg.toLowerCase().trim();

  // Saudação
  if (wh.isOla(msg)) {
    const saudacao = wh.obterSaudacao(msg);
    return wh.montarBoasVindas('gratis', saudacao, 0);
  }

  // Agradecimento
  if (wh.ehAgradecimento(m)) return wh.MSG_AGRADECIMENTO;

  // Conceitos fixos (ordem importa: específicos antes de genéricos)
  if (wh.ehDiferencaDR(m))           return wh.RESP_DIF_DR_DISJ;
  if (wh.ehPerguntaDR(m))            return wh.RESP_DR;
  if (wh.ehPerguntaDPS(m))           return wh.RESP_DPS;
  if (wh.ehPerguntaDisjuntor(m))     return wh.RESP_DISJUNTOR;
  if (wh.ehPerguntaTensaoBR(m))      return wh.RESP_TENSAO_BR;

  // Conversões
  const respConv = wh.tentarConversao(m);
  if (respConv) return respConv;

  // Bypasses paramétricos (ordem: trafo → bitola+amperes → cabo → disjuntor)
  let r = wh.tentarTrafoCabo(m);
  if (r) return r;
  r = wh.tentarCabosBitolaQtd(m);
  if (r) return r;
  r = wh.tentarCaboPorAmperes(m);
  if (r) return r;
  r = wh.tentarDisjuntorPorAmperes(m);
  if (r) return r;

  return null;
}

// ─── Main ───────────────────────────────────────────────────────

console.log(`\n${c.bold}${c.cyan}═══ SUÍTE DE REGRESSÃO — SEU ENGENHEIRO AI ═══${c.reset}`);
console.log(`${c.dim}${casos.length} casos | LLM: ${incluirLLM ? 'ON' : 'OFF (use --llm)'}${c.reset}\n`);

const resultados = [];
for (const caso of casos) {
  const r = await executarCaso(caso);
  resultados.push({ caso, ...r });

  const id = String(caso.id).padStart(2);
  const cat = caso.categoria.padEnd(28).slice(0, 28);
  const t = `${(r.tempoMs ?? 0).toString().padStart(5)}ms`;

  if (r.skip) {
    console.log(`${c.dim}[${id}] ${cat} ${t}  SKIP — ${r.motivo}${c.reset}`);
  } else if (r.ok) {
    console.log(`${c.green}[${id}] ${cat} ${t}  ✓ PASS${c.reset}  ${c.dim}"${caso.pergunta.slice(0, 50)}"${c.reset}`);
  } else {
    console.log(`${c.red}[${id}] ${cat} ${t}  ✗ FAIL${c.reset}  ${c.dim}"${caso.pergunta.slice(0, 50)}"${c.reset}`);
    console.log(`${c.red}     └─ ${r.motivo}${c.reset}`);
  }
}

// ─── Sumário ────────────────────────────────────────────────────

const total = resultados.length;
const passed = resultados.filter(r => r.ok).length;
const failed = resultados.filter(r => r.fail).length;
const skipped = resultados.filter(r => r.skip).length;
const pctPass = total > 0 ? ((passed / (total - skipped)) * 100).toFixed(1) : 0;

console.log(`\n${c.bold}═══ SUMÁRIO ═══${c.reset}`);
console.log(`${c.green}✓ Passou: ${passed}${c.reset}`);
console.log(`${c.red}✗ Falhou: ${failed}${c.reset}`);
if (skipped > 0) console.log(`${c.dim}⏭  Pulado: ${skipped}${c.reset}`);
console.log(`${c.bold}Taxa de sucesso: ${pctPass}%${c.reset}\n`);

// Detalhe de falhas
if (failed > 0) {
  console.log(`${c.bold}${c.red}═══ FALHAS DETALHADAS ═══${c.reset}\n`);
  for (const r of resultados.filter(x => x.fail)) {
    console.log(`${c.red}[${r.caso.id}] ${r.caso.categoria}${c.reset}`);
    console.log(`${c.dim}    Pergunta:${c.reset} ${r.caso.pergunta}`);
    console.log(`${c.dim}    Motivo:  ${c.reset} ${r.motivo}`);
    if (r.resposta) {
      const preview = r.resposta.slice(0, 200).replace(/\n/g, '\n             ');
      console.log(`${c.dim}    Resposta:${c.reset} ${preview}${r.resposta.length > 200 ? '...' : ''}`);
    }
    console.log('');
  }
}

// Exit
process.exit(failed > 0 ? 1 : 0);
