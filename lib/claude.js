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
    justificativa:/\b(como\s+funciona|por\s+que|justificativa|explica\s+como)\b/.test(userMsg),
    materiais:    /\b(lista\s+de\s+materiais|ver\s+material|o\s+que\s+comprar|materiais\s+necess|quais\s+(os\s+)?materiais)\b/.test(userMsg),
  };

  // Mapa: emoji que inicia seção → chave do pedido
  const SECOES_OPCIONAIS = [
    { emoji: '📐', chave: 'contexto' },
    { emoji: '🧮', chave: 'formula' },
    { emoji: '📊', chave: 'calculo' },
    { emoji: '📋', chave: 'norma' },
    { emoji: '✅', chave: 'verificacoes' },  // Note: ⚡ é Resultado (sempre OK), ✅ é Verificações
    { emoji: '🔧', chave: 'observacoes' },
    { emoji: '🛠️', chave: 'justificativa' },
    { emoji: '📦', chave: 'materiais' },
  ];

  // Linhas SEMPRE permitidas (título, resultado, alerta, divisor, footer)
  function linhaSemprePermitida(linha) {
    return /^(🟢|🔵|🟡|⚡|⚠️|━+|\s*\*Caso queira mais detalhes)/.test(linha) ||
           linha.trim() === '';
  }

  // Identifica seção a partir do emoji inicial
  function detectarSecao(linha) {
    for (const { emoji, chave } of SECOES_OPCIONAIS) {
      if (linha.startsWith(emoji)) return chave;
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

export async function chamarClaude(telefone, mensagem, plano = 'gratis') {
  try {
    const historico = await buscarConversasRecentes(telefone, 10);

    const contextoPlano = plano !== 'gratis'
      ? `\n[PLANO: ${plano.toUpperCase()} — acesso completo]`
      : `\n[PLANO: GRÁTIS]`;

    let systemContent = SYSTEM_PROMPT;

    // ── RAG path ──────────────────────────────────────────────
    if (USE_RAG) {
      // 1) cache semântico (threshold 0.95 = quase idêntico)
      const hit = await buscarCache(mensagem);
      if (hit && hit.resposta) {
        console.log(`[CACHE HIT] sim=${hit.similarity.toFixed(3)} → resposta cacheada`);
        return hit.resposta;
      }

      // 2) classificação + busca de chunks relevantes
      const categorias = classificarIntencao(mensagem);
      const chunks = await buscarChunksRelevantes(mensagem, {
        threshold: 0.75,
        matchCount: 3,
        categorias: categorias.length > 0 ? categorias : null
      });

      const contextoChunks = montarContextoChunks(chunks);
      if (contextoChunks) {
        systemContent = SYSTEM_PROMPT + '\n\n' + contextoChunks;
        console.log(`[RAG] cats=[${categorias.join(',')}] chunks=${chunks.length}`);
      } else {
        console.log(`[RAG] cats=[${categorias.join(',')}] chunks=0 (sem contexto extra)`);
      }
    }

    const response = await client.chat.completions.create({
      model: 'gpt-5-mini',
      // Reduzido de 4000→1500: respostas típicas têm 150-300 tokens.
      // 1500 dá folga de ~5x mantendo latência mais previsível.
      max_completion_tokens: 1500,
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: systemContent },
        ...historico,
        { role: 'user', content: mensagem + contextoPlano }
      ]
    });

    const respostaBruta = response.choices[0].message.content;
    if (!respostaBruta || respostaBruta.trim().length === 0) {
      console.error('[OPENAI VAZIO]', JSON.stringify(response));
      throw new Error('Resposta vazia da IA');
    }

    // 🎯 MINIMALISMO: remove seções não pedidas pelo usuário
    const resposta = aplicarMinimalismo(respostaBruta, mensagem);
    const tamAntes = respostaBruta.split('\n').length;
    const tamDepois = resposta.split('\n').length;
    if (tamAntes !== tamDepois) {
      console.log(`[MINIMALISMO] ${tamAntes} → ${tamDepois} linhas (removidas ${tamAntes - tamDepois})`);
    }

    // Salva cache (fire-and-forget — não bloqueia resposta)
    if (USE_RAG) {
      salvarCache(mensagem, resposta).catch(err =>
        console.error('[CACHE] erro async:', err)
      );
    }

    return resposta;

  } catch (err) {
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
      reasoning_effort: 'low',
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
      reasoning_effort: 'low',
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
