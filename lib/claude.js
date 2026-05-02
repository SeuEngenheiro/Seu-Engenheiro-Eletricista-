import OpenAI from 'openai';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { toFile } from 'openai/uploads';
import { buscarConversasRecentes } from './supabase.js';
import {
  classificarIntencao,
  buscarChunksRelevantes,
  buscarCache,
  salvarCache,
  montarContextoChunks
} from './rag.js';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Feature flag: USE_RAG=true habilita RAG; default = false (rollback grátis)
const USE_RAG = process.env.USE_RAG === 'true';

// Sempre carrega o prompt completo (usado por foto e busca premium)
const FULL_PROMPT = readFileSync(join(process.cwd(), 'prompt.txt'), 'utf-8');

// SYSTEM_PROMPT: core.txt se RAG ligado, senão prompt.txt completo
const CORE_PATH = join(process.cwd(), 'core.txt');
const SYSTEM_PROMPT = USE_RAG && existsSync(CORE_PATH)
  ? readFileSync(CORE_PATH, 'utf-8')
  : FULL_PROMPT;

console.log(`[RAG] USE_RAG=${USE_RAG} | system: ${SYSTEM_PROMPT.length} chars | full: ${FULL_PROMPT.length} chars`);

// ═══════════════════════════════════════════════════════════════
// POST-PROCESSAMENTO — força minimalismo
// Remove seções (Contexto, Fórmula, Cálculo, Norma, Verificações,
// Observações, Justificativa, Materiais) que o usuário NÃO pediu
// explicitamente. Garante resposta enxuta mesmo se LLM ignorar regras.
// ═══════════════════════════════════════════════════════════════

function aplicarMinimalismo(resposta, mensagemUser) {
  if (!resposta) return resposta;
  const userMsg = (mensagemUser || '').toLowerCase();

  // Detecta o que o usuário pediu EXPLICITAMENTE
  const pediuTudo = /\b(tudo|completo|detalhado|relat[óo]rio\s+completo)\b/.test(userMsg);
  if (pediuTudo) return resposta;  // libera resposta completa

  const pedidos = {
    contexto:     /\b(explica\s+contexto|contextualiza|me\s+contextualize)\b/.test(userMsg),
    formula:      /\b(f[óo]rmula|equa[çc][ãa]o|f[óo]rmulas)\b/.test(userMsg),
    calculo:      /\b(passo\s+a\s+passo|mostra\s+(o\s+)?c[áa]lculo|como\s+chegou|como\s+calcula|me\s+explica\s+o\s+c[áa]lculo|detalha\s+(o\s+)?c[áa]lculo|mostre\s+o\s+c[áa]lculo)\b/.test(userMsg),
    norma:        /\b(qual\s+(a\s+)?norma|qual\s+artigo|art\b|nbr\s+\d|qual\s+nbr|cita\s+a\s+norma|art\s+do\s+crea)\b/.test(userMsg),
    verificacoes: /\b(verifica[çc][õo]es|checklist|lista\s+de\s+verifica)\b/.test(userMsg),
    observacoes:  /\bobserva[çc][õo]es\b/.test(userMsg),
    justificativa:/\b(como\s+(funciona|fazer|instalar|montar|executar)|por\s+que|justificativa|explica\s+como|me\s+explique|me\s+ensina)\b/.test(userMsg),
    materiais:    /\b(lista\s+de\s+materiais|ver\s+material|o\s+que\s+comprar|materiais\s+necess|quais\s+(os\s+)?materiais)\b/.test(userMsg),
  };

  // Detecção por LABEL (não só emoji) — porque emojis se repetem entre modos.
  // ✅ pode ser 'Verificações' (Modo 1) OU 'Resposta direta' (Modo 2).
  // 🔧 pode ser 'Observações' (Modo 1) OU 'Solução' (Modo 3).
  // Lista abaixo: padrão regex que identifica seção OPCIONAL (removível).
  const SECOES_OPCIONAIS = [
    { regex: /^📐\s+\*?Contexto/i,        chave: 'contexto' },
    { regex: /^🧮\s+\*?(F[óo]rmula|Equa)/i, chave: 'formula' },
    { regex: /^📊\s+\*?C[áa]lculo/i,       chave: 'calculo' },
    { regex: /^📋\s+\*?Norma/i,           chave: 'norma' },
    { regex: /^✅\s+\*?Verifica/i,         chave: 'verificacoes' },  // ← só Verificações
    { regex: /^🔧\s+\*?Observa/i,          chave: 'observacoes' },   // ← só Observações
    { regex: /^🛠️\s+\*?Justifica/i,       chave: 'justificativa' },
    { regex: /^📦\s+\*?Materia/i,          chave: 'materiais' },
    { regex: /^💡\s+\*?Dica/i,             chave: 'justificativa' }, // dica = justificativa
  ];

  // Linhas SEMPRE permitidas (título de qualquer modo, ⚡ Resultado,
  // ⚠️ Alerta/Riscos, ✅ Resposta direta, 🔧 Solução, 🔍 Causas,
  // 🧪 Testes, divisor, footer)
  function linhaSemprePermitida(linha) {
    return (
      /^(🟢|🔵|🟡|⚡|⚠️|🔍|🧪|━+|\s*\*Caso queira mais detalhes)/.test(linha) ||
      /^✅\s+\*?Resposta/i.test(linha) ||  // Modo 2: Resposta direta — sempre OK
      /^🔧\s+\*?Solu[çc]/i.test(linha) ||  // Modo 3: Solução — sempre OK
      linha.trim() === ''
    );
  }

  // Identifica seção pela regex (não pelo emoji bruto)
  function detectarSecao(linha) {
    for (const { regex, chave } of SECOES_OPCIONAIS) {
      if (regex.test(linha)) return chave;
    }
    return null;
  }

  const linhas = resposta.split('\n');
  const resultado = [];
  let secaoCorrente = null;
  let manterSecao = true;

  for (const linha of linhas) {
    // Detecta abertura de nova seção (opcional ou sempre permitida)
    if (linhaSemprePermitida(linha) && !linha.trim() === '') {
      // Linha sempre permitida (título/⚡/⚠️/━━━/Caso queira) — encerra seção opcional
      secaoCorrente = null;
      manterSecao = true;
    }

    const novaSecao = detectarSecao(linha);
    if (novaSecao !== null) {
      secaoCorrente = novaSecao;
      manterSecao = pedidos[novaSecao] === true;
    } else if (linhaSemprePermitida(linha) && linha.trim() !== '') {
      // Resultado/Alerta/Título/Footer reseta — sempre manter
      secaoCorrente = null;
      manterSecao = true;
    }

    if (manterSecao) resultado.push(linha);
  }

  return resultado.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Timeouts da OpenAI — calibrados pra evitar abort prematuro.
// Modelo gpt-5-mini tem variabilidade alta (TTFB pode ir de 0.5s a 6s
// dependendo de carga). Margem maior evita falsos timeouts que deixam
// o usuário sem resposta. Vercel maxDuration=60s, ainda cabe folgado.
// - reasoning='minimal' (perguntas normais): 8000ms
// - reasoning='low'     (cálculo numérico):   15000ms
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 8000);

/**
 * Detecta se a mensagem envolve CÁLCULO NUMÉRICO complexo
 * (dimensionamento, fator de agrupamento, queda de tensão, paralelos).
 * Quando true, usa reasoning='low' que recupera precisão aritmética
 * — mas custa ~1-3s extra de latência. Vale o trade-off pra evitar
 * erros graves de cálculo (ex: bot indicando 2× 240 mm² pra 759 A
 * sem aplicar fator de agrupamento).
 */
function precisaCalculoPreciso(mensagem) {
  const m = (mensagem || '').toLowerCase();
  return (
    // Cabo/disjuntor com bitola e/ou amperagem
    /\b\d+\s*(mm[²2]?|cv|hp|kva|kw|w|a|amperes?|volts?)\b/.test(m) &&
    /\b(cabo|cabos|condutor|disjuntor|motor|trafo|transformador|paralelo|paralel|bitola|se[çc][aã]o|carga|queda|dimensionar|dimensiona|calcula)\b/.test(m)
  ) ||
  // Pergunta explicitamente sobre quantidade/cálculo
  /\b(quantos\s+cabos|quantas\s+fases|quanto[s]?\s+amp|quantos\s+disjuntor)/.test(m) ||
  // Conversões e fatores
  /\bfator\s+de\s+(agrupamento|correção|temperatura|potência)/.test(m);
}

export async function chamarClaude(telefone, mensagem, plano = 'gratis') {
  const t0 = Date.now();
  try {
    // Cálculo numérico NÃO usa cache: embeddings de "motor 400cv" e
    // "motor 500cv" têm similaridade ~0,97 (acima do threshold 0,95),
    // o que faria o cache servir a resposta de 400 CV pra uma pergunta
    // de 500 CV. Resposta certa = errada por similaridade textual alta
    // mas semântica numérica diferente. Bug real reportado em 02/05/2026.
    const ehCalculoNumerico = precisaCalculoPreciso(mensagem);

    // Histórico reduzido de 10→5: economiza ~200ms de input + ~150ms supabase
    const historico = await buscarConversasRecentes(telefone, 5);
    const tHistorico = Date.now();

    const contextoPlano = plano !== 'gratis'
      ? `\n[PLANO: ${plano.toUpperCase()} — acesso completo]`
      : `\n[PLANO: GRÁTIS]`;

    let systemContent = SYSTEM_PROMPT;

    // ── RAG path ──────────────────────────────────────────────
    if (USE_RAG) {
      const categorias = classificarIntencao(mensagem);

      // Pula cache pra cálculo numérico — risco de hit indevido em
      // perguntas com números próximos (400 CV vs 500 CV).
      // Chunks (knowledge_chunks) continuam OK porque enriquecem o
      // contexto sem substituir a resposta.
      const cachePromise = ehCalculoNumerico
        ? Promise.resolve(null)
        : buscarCache(mensagem);

      const [hit, chunks] = await Promise.all([
        cachePromise,
        buscarChunksRelevantes(mensagem, {
          threshold: 0.75,
          matchCount: 3,
          categorias: categorias.length > 0 ? categorias : null
        })
      ]);

      if (hit && hit.resposta) {
        console.log(`[CACHE HIT ${Date.now() - t0}ms] sim=${hit.similarity.toFixed(3)}`);
        return hit.resposta;
      }

      if (ehCalculoNumerico) {
        console.log(`[CACHE SKIP] cálculo numérico — não cacheia nem busca`);
      }

      const contextoChunks = montarContextoChunks(chunks);
      if (contextoChunks) {
        systemContent = SYSTEM_PROMPT + '\n\n' + contextoChunks;
        console.log(`[RAG] cats=[${categorias.join(',')}] chunks=${chunks.length}`);
      }
    }

    // Timeout dinâmico: cálculo numérico (reasoning='low') precisa mais tempo.
    // - 'minimal' → 8000ms  (perguntas normais)
    // - 'low'     → 15000ms (cálculo numérico)
    const usarReasoningPreCheck = precisaCalculoPreciso(mensagem);
    const timeoutMs = usarReasoningPreCheck
      ? Number(process.env.OPENAI_TIMEOUT_CALC_MS || 15000)
      : OPENAI_TIMEOUT_MS;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    // Reasoning condicional: 'low' p/ cálculo numérico, 'minimal' p/ resto.
    // Reusa o pré-check feito no timeout.
    const reasoningEffort = usarReasoningPreCheck ? 'low' : 'minimal';

    // ⚠️ max_completion_tokens em modelos GPT-5 com reasoning é COMPARTILHADO
    // entre reasoning_tokens (pensamento interno invisível) e output (resposta).
    // Bug encontrado em 02/05/2026: pergunta de motor 400 CV consumiu 800/800
    // em reasoning, sobrando 0 pra resposta → content="" → erro vazio.
    //
    // Calibração:
    // - 'minimal': sem reasoning → 800 tokens cobre output típico (150-300).
    // - 'low':     cálculo complexo → reasoning_tokens pode chegar a 1500
    //              + output 500-1000 = teto 2500 dá folga.
    const maxTokens = usarReasoningPreCheck ? 2500 : 800;

    const tLLMStart = Date.now();
    let response;
    try {
      response = await client.chat.completions.create({
        model: 'gpt-5-mini',
        max_completion_tokens: maxTokens,
        reasoning_effort: reasoningEffort,
        messages: [
          { role: 'system', content: systemContent },
          ...historico,
          { role: 'user', content: mensagem + contextoPlano }
        ]
      }, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    const tLLMEnd = Date.now();

    const respostaBruta = response.choices[0].message.content;
    const finishReason = response.choices[0].finish_reason;
    const reasoningTokens = response.usage?.completion_tokens_details?.reasoning_tokens;

    if (!respostaBruta || respostaBruta.trim().length === 0) {
      // Diagnóstico explícito: distingue "estouro por reasoning" (length +
      // reasoning_tokens ≈ max_completion_tokens) de outras causas.
      const culpaDoReasoning =
        finishReason === 'length' &&
        reasoningTokens !== undefined &&
        reasoningTokens >= maxTokens * 0.9;

      console.error('[OPENAI VAZIO]', {
        finishReason,
        reasoningTokens,
        maxTokens,
        culpaDoReasoning,
        usage: response.usage
      });

      if (culpaDoReasoning) {
        // Caso raro: mesmo com 2500, reasoning consumiu tudo. Sugere prompt
        // muito complexo. Mensagem específica pro usuário simplificar.
        throw new Error(
          'Pergunta muito complexa pra processar agora. Tenta dividir em ' +
          'partes menores (ex: primeiro o motor, depois o cabo).'
        );
      }
      throw new Error('Resposta vazia da IA');
    }

    // 🎯 MINIMALISMO: remove seções não pedidas pelo usuário
    const resposta = aplicarMinimalismo(respostaBruta, mensagem);

    console.log(
      `[TIMING] hist=${tHistorico - t0}ms llm=${tLLMEnd - tLLMStart}ms total=${Date.now() - t0}ms reasoning=${reasoningEffort}`
    );

    // Salva cache (fire-and-forget — não bloqueia resposta).
    // Não cacheia cálculo numérico: evita poluir base com respostas
    // que mudam conforme números na pergunta (motor 400 vs 500 CV).
    if (USE_RAG && !ehCalculoNumerico) {
      salvarCache(mensagem, resposta).catch(err =>
        console.error('[CACHE] erro async:', err)
      );
    }

    return resposta;

  } catch (err) {
    if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
      console.error(`[OPENAI TIMEOUT ${Date.now() - t0}ms] excedeu ${OPENAI_TIMEOUT_MS}ms`);
      throw new Error('Demorei demais pra responder. Pode tentar de novo?');
    }
    console.error('[OPENAI ERROR]', err);
    throw new Error('Erro ao chamar a IA. Tente novamente.');
  }
}

export async function analisarFoto(telefone, imageBase64, mimeType, plano = 'pro') {
  try {
    const historico = await buscarConversasRecentes(telefone, 10);

    // Foto sempre usa prompt completo (multimodal precisa de tudo)
    const response = await client.chat.completions.create({
      model: 'gpt-5-mini',
      // Foto pode gerar resposta mais longa que texto — 2000 é razoável
      max_completion_tokens: 2000,
      // 'minimal' p/ reduzir latência. Foto multimodal + reasoning='low'
      // somava 8-15s. Com 'minimal' fica ~3-5s.
      reasoning_effort: 'minimal',
      messages: [
        { role: 'system', content: FULL_PROMPT },
        ...historico,
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' } },
            { type: 'text', text: 'Analise esta foto de instalação elétrica. Identifique problemas, riscos e orientações técnicas baseadas na NBR 5410. Responda em uma única mensagem.' }
          ]
        }
      ]
    });

    const resposta = response.choices[0].message.content;
    if (!resposta || resposta.trim().length === 0) {
      throw new Error('Resposta vazia da IA');
    }
    return resposta;

  } catch (err) {
    console.error('[OPENAI FOTO ERROR]', err);
    throw new Error('Erro ao analisar foto.');
  }
}

export async function buscarPrecosIA(telefone, mensagem, plano = 'premium') {
  try {
    const historico = await buscarConversasRecentes(telefone, 10);

    // Busca premium sempre usa prompt completo (já tem tool web_search)
    const response = await client.chat.completions.create({
      model: 'gpt-5-mini',
      // Listas com preços podem ter ~500-800 tokens — 2000 é confortável
      max_completion_tokens: 2000,
      // Busca premium TEM tool web_search → toolcall já adiciona 2-4s.
      // Mantemos 'minimal' p/ não somar reasoning extra.
      reasoning_effort: 'minimal',
      tools: [{ type: 'web_search_preview', search_context_size: 'medium' }],
      tool_choice: 'required',
      messages: [
        { role: 'system', content: FULL_PROMPT },
        ...historico,
        { role: 'user', content: mensagem + '\n[PREMIUM: buscar preços atuais de materiais elétricos Brasil 2026. Usar faixa R$X a R$Y. Responder em uma única mensagem. Sem LaTeX. Sem markdown headers.]' }
      ]
    });

    const resposta = response.choices[0].message.content || 'Não consegui buscar os preços agora. Tente novamente!';
    return resposta;

  } catch (err) {
    console.error('[BUSCA PRECOS ERROR]', err);
    throw new Error('Erro ao buscar preços.');
  }
}

// ═══════════════════════════════════════════════════════════════
// TRANSCRIÇÃO DE ÁUDIO (Speech-to-Text)
// Adicionado em 27/04/2026 — habilita áudio de entrada via WhatsApp
// ═══════════════════════════════════════════════════════════════

export async function transcreverAudio(audioBuffer, mimeType = 'audio/ogg') {
  try {
    // Determina extensão pelo mimeType
    let extensao = 'ogg';
    if (mimeType.includes('mp3') || mimeType.includes('mpeg')) extensao = 'mp3';
    else if (mimeType.includes('wav')) extensao = 'wav';
    else if (mimeType.includes('m4a')) extensao = 'm4a';
    else if (mimeType.includes('webm')) extensao = 'webm';

    const file = await toFile(audioBuffer, `audio.${extensao}`, { type: mimeType });

    const response = await client.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'pt',
      prompt: 'Transcrição em português brasileiro de pergunta sobre engenharia elétrica. Termos técnicos: disjuntor, cabo, NBR 5410, motor, chuveiro, kVA, kW, CV, ampere, volts, queda de tensão, fator de potência, DR, DPS.'
    });

    const texto = response.text?.trim();
    if (!texto || texto.length === 0) {
      throw new Error('Transcrição vazia');
    }

    return texto;

  } catch (err) {
    console.error('[WHISPER ERROR]', err);
    throw new Error('Erro ao transcrever áudio.');
  }
}
