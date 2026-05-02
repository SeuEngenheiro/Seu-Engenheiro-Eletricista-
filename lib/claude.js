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
import { validarRespostaTecnica, corrigirUnidadesSI } from './validacao.js';

// Feature flag: VALIDACAO_BLOQUEAR=true bloqueia respostas com severidade
// crítica e força regenerar (Fase 2). Default false = só loga (Fase 1).
const VALIDACAO_BLOQUEAR = process.env.VALIDACAO_BLOQUEAR === 'true';

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

// ═══════════════════════════════════════════════════════════════
// REMOÇÃO DE FRASES ROBÓTICAS — Sprint 1, 02/05/2026
// LLM ainda escapa com "que ótima pergunta", "espero ter ajudado"
// mesmo com instruções no prompt. Esse pós-processador garante
// que essas frases NUNCA chegam ao usuário.
// ═══════════════════════════════════════════════════════════════

const PADROES_ROBOTICOS = [
  // Saudações de abertura desnecessárias (já passou pelo bypass de saudação)
  /\bque\s+(ó|o)tima\s+pergunta!?/gi,
  /\bque\s+excelente\s+pergunta!?/gi,
  /\bótima\s+pergunta!?/gi,
  /\bvamos\s+lá!?/gi,
  /\bvamos\s+analisar\s+(juntos|isso)!?/gi,
  // Encerramentos vazios
  /\bespero\s+(ter\s+ajudado|que\s+(isso|isto)\s+(te\s+)?ajude)!?/gi,
  /\bfico\s+(à|a)\s+disposição\.?!?/gi,
  /\bsinta-se\s+(à|a)\s+vontade[^.!?\n]*[.!?]?/gi,
  /\bqualquer\s+(outra\s+)?d(ú|u)vida[,.\s]+(é\s+só\s+)?(chamar|me\s+(avisar|chamar)|estou\s+(à|a)\s+disposi(ç|c)(ã|a)o)[^.!?\n]*[.!?]?/gi,
  /\bposso\s+(te\s+)?ajudar\s+(com\s+)?(mais\s+(alguma|outra)\s+coisa|em\s+algo\s+mais)\??/gi,
  // Preâmbulos vazios
  /^aqui\s+est(á|a)\s+(a\s+)?resposta\s*[:\-]?\s*\n?/i,
  /^(ent(ã|a)o,?\s+)?(deixa|deixe)\s+(eu\s+)?(te\s+)?(explicar|responder)\s*[:\-]?\s*\n?/gi,
  // Bonecos / emojis sociais excessivos no fim
  /\s*(😊|😄|😁|🙂|😃)+\s*$/gm,
];

function removerFrasesRoboticas(texto) {
  if (!texto) return texto;
  let r = texto;
  for (const re of PADROES_ROBOTICOS) {
    r = r.replace(re, '');
  }
  // Limpa espaços/quebras criadas pela remoção
  r = r.replace(/\n[ \t]+\n/g, '\n\n');     // linha só com whitespace → quebra
  r = r.replace(/\n{3,}/g, '\n\n');          // múltiplas quebras → 2
  r = r.replace(/[ \t]{2,}/g, ' ');          // múltiplos espaços → 1
  r = r.replace(/^[ \t]+/gm, m => m);        // mantém indentação se intencional
  return r.trim();
}

// ═══════════════════════════════════════════════════════════════
// DISCLAIMER RT/ART — Sprint 2.3, 02/05/2026
// Toda resposta com cálculo determinístico (cabo, disjuntor, motor,
// trafo, dimensionamento) deve terminar com lembrete de validação
// por Engenheiro Eletricista com ART. Proteção legal pro RT (Alexandre
// CREA-SP 5070405741) e responsabilidade técnica clara pro usuário.
// ═══════════════════════════════════════════════════════════════

const DISCLAIMER_RT = `\n\n_Pra projeto formal com ART, valide com Engenheiro Eletricista CREA Ativo._`;

/**
 * Adiciona disclaimer RT/ART ao final da resposta SE:
 *  1) Resposta menciona dimensionamento (cabo X mm², disjuntor X A,
 *     IB, motor, trafo, paralelo, etc).
 *  2) Disclaimer ainda não está presente (evita duplicar).
 *
 * NÃO adiciona em respostas de saudação, conceito puro (DR, DPS),
 * planos, agradecimento ou erro.
 */
function adicionarDisclaimerSeNecessario(resposta) {
  if (!resposta) return resposta;

  // Já tem disclaimer? não duplicar
  const jaTem =
    /engenheiro\s+eletricista\s+(crea|com\s+art)/i.test(resposta) ||
    /\bart\b[^.\n]{0,40}\b(crea|engenheiro|profission)/i.test(resposta) ||
    /valide\s+com\s+(engenheiro|profissional)/i.test(resposta);
  if (jaTem) return resposta;

  // Tem cálculo determinístico? — sinais inequívocos
  const temCalculoDet =
    /\b\d+(?:[.,]\d+)?\s*mm[²2]\b/i.test(resposta) ||                    // bitola
    /\bdisjuntor\s+(?:de\s+)?\d+(?:[.,]\d+)?\s*A\b/i.test(resposta) ||    // disjuntor X A
    /\bIB\s*[≈=~:]?\s*\d+/i.test(resposta) ||                              // IB = X
    /\b\d+(?:[.,]\d+)?\s*(?:cv|hp|kva|kw)\b.*\b\d+(?:[.,]\d+)?\s*v\b/i.test(resposta) || // motor X cv Y v
    /\bem\s+paralelo\b/i.test(resposta) ||
    /\bcurva\s+[bcd]\b/i.test(resposta);

  if (!temCalculoDet) return resposta;

  return resposta.trimEnd() + DISCLAIMER_RT;
}

function aplicarMinimalismo(resposta, mensagemUser) {
  if (!resposta) return resposta;
  const userMsg = (mensagemUser || '').toLowerCase();

  // Sprint 3 (02/05/2026): com a estrutura 5 BLOCOS no prompt, o LLM
  // gera respostas adaptativas (omite blocos desnecessários). Os ícones
  // de seção antigos (📐 🧮 📊 ✅ 🛠️ 📋) estão proibidos no prompt.
  //
  // Detector de formato antigo: se a resposta NÃO tiver ícones antigos,
  // retorna direto (formato 5 blocos é auto-suficiente).
  // Mantém lógica antiga só pra COMPATIBILIDADE durante transição.
  const temFormatoAntigo =
    /^[📐🧮📊📋✅🛠️📦💡]\s+\*?(Contexto|F[óo]rmula|C[áa]lculo|Norma|Verifica|Observa|Justifica|Materia|Dica|Equa)/im.test(resposta);

  if (!temFormatoAntigo) return resposta;

  // ─── A partir daqui: lógica antiga (compatibilidade) ───
  // Detecta o que o usuário pediu EXPLICITAMENTE
  const pediuTudo = /\b(tudo|completo|detalhado|relat[óo]rio\s+completo)\b/.test(userMsg);
  if (pediuTudo) return resposta;  // libera resposta completa

  // ── Pergunta EXPLICATIVA / TÉCNICA EXTENSA → não minimiza ────
  // Bug real (02/05/2026): "Como converter kW em A em sistema 380V
  // considerando FP variável e carga não linear conforme NBR 5410?"
  // bot devolveu APENAS o título — minimalismo cortou fórmula+cálculo.
  // Heurísticas de pergunta que QUER explicação completa:
  const ehExplicativa =
    userMsg.length > 80 ||  // pergunta longa = quer explicação
    /\bcomo\s+(converter|calcular|dimensionar|aplicar|aplica|determinar|escolher|definir|interpretar|verificar|identificar|analisar|proceder)\b/.test(userMsg) ||
    /\bconsiderando\b/.test(userMsg) ||
    /\bcrit[ée]rios?\s+(de|da|do)\b/.test(userMsg) ||
    /\bregime\s+(de|do|da)\b/.test(userMsg) ||
    /\b(princ[íi]pio|fundamento|conceito|m[ée]todo)\s+(de|do|da)\b/.test(userMsg) ||
    /\bdiferen[çc]a\s+entre\b/.test(userMsg);
  if (ehExplicativa) return resposta;

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

  const final = resultado.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  // Safety net: se o minimalismo cortou >70% da resposta, é sinal de
  // que algo deu errado (bug 02/05/2026: cortou TUDO menos o título).
  // Quando isso acontecer, retorna a resposta bruta — preferível
  // resposta longa correta que resposta curta inútil.
  const cortePct = 1 - (final.length / Math.max(resposta.length, 1));
  if (cortePct > 0.7 && resposta.length > 200) {
    console.warn(`[MINIMALISMO ABORTADO] cortou ${(cortePct*100).toFixed(0)}% (${resposta.length} → ${final.length} chars) — retornando bruto`);
    return resposta;
  }

  return final;
}

// Timeouts da OpenAI — calibrados pra evitar abort prematuro.
// Modelo gpt-5-mini tem variabilidade alta (TTFB pode ir de 0.5s a 6s
// dependendo de carga). Margem maior evita falsos timeouts que deixam
// o usuário sem resposta. Vercel maxDuration=60s, ainda cabe folgado.
//
// Calibragem 02/05/2026 (após bugs reais):
// - reasoning='minimal' (perguntas normais): 12000ms (era 8000, estourava)
// - reasoning='low'     (cálculo numérico):  20000ms (era 15000)
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 12000);

/**
 * Detecta se a mensagem envolve CÁLCULO NUMÉRICO complexo
 * (dimensionamento, fator de agrupamento, queda de tensão, paralelos,
 * quadro elétrico residencial/comercial/industrial, projeto).
 * Quando true, usa reasoning='low' que recupera precisão aritmética
 * — mas custa ~1-3s extra de latência. Vale o trade-off pra evitar
 * erros graves de cálculo.
 *
 * Histórico de bugs cobertos:
 * - 02/05/2026: "dimensionar quadro elétrico de casa 200m²" passava
 *   batido (200m² não bate com 'mm²|cv|kw'). Resultado: usava 'minimal'
 *   com timeout 8s e estourava — usuário recebia mensagem de erro.
 *   Fix: incluir unidades de área/comprimento (m²/m/cm/km) e
 *   palavras-chave residenciais (quadro/circuito/tomada/...).
 */
function precisaCalculoPreciso(mensagem) {
  const m = (mensagem || '').toLowerCase();

  // 1) Número + unidade técnica (elétrica OU área OU comprimento).
  // 2 regras: a) unidades com sufixo claro; b) "X m" isolado (metros).
  const temNumeroUnidade =
    /\b\d+(?:[.,]\d+)?\s*(mm[²2]?|m[²2]\b|metros?\b|cm\b|km\b|cv|hp|kva|kw|mw|wh|w\b|a\b|amperes?|volts?\b|v\b|hz|btu|lumens?|lux)\b/i.test(m) ||
    /\b\d+(?:[.,]\d+)?\s*m(?=\s|[.,;:?!]|$)/i.test(m);

  // 2) Palavra técnica de cálculo/dimensionamento (lista expandida)
  const temPalavraTecnica = /\b(cabo|cabos|condutor|disjuntor|motor|trafo|transformador|paralelo|paralel|bitola|se[çc][aã]o|carga|queda|dimensionar|dimensiona|calcula|circuito|quadro\s+(el[ée]tric|de\s+distribu)|tug|tue|ilumina[çc][ãa]o|tomada|chuveiro|forno|cooktop|aquecedor|ar[\s-]?condicionado|split|geladeira|residen[cs]ia|resid[eê]nci|comercial|industrial|projeto\s+(el[ée]trico|de\s+instala)|padr[ãa]o\s+de\s+entrada|alimentador|ramal)\b/i.test(m);

  return (temNumeroUnidade && temPalavraTecnica) ||
    // 3) Pergunta explícita sobre quantidade/dimensionamento
    /\b(quantos\s+cabos|quantas\s+fases|quanto[s]?\s+amp|quantos\s+disjuntor|quantos\s+circuitos|quantas\s+tomadas)/.test(m) ||
    // 4) Verbos de dimensionamento sem número (intenção clara de cálculo)
    /\bdimension(ar|ando|amento)\s+(o\s+)?(quadro|circuito|disjuntor|cabo|motor|alimentador|padr[ãa]o\s+de\s+entrada)/.test(m) ||
    /\b(montar|projetar|fazer)\s+(o\s+)?(quadro|projeto)\s+(el[ée]trico|de\s+distribu)/.test(m) ||
    // 5) Fatores e conversões
    /\bfator\s+de\s+(agrupamento|correção|corre[çc][ãa]o|temperatura|pot[eê]ncia|demanda|simultaneidade)/.test(m);
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
    // - 'minimal' → 12000ms (perguntas normais)
    // - 'low'     → 20000ms (cálculo numérico)
    const usarReasoningPreCheck = precisaCalculoPreciso(mensagem);
    const timeoutMs = usarReasoningPreCheck
      ? Number(process.env.OPENAI_TIMEOUT_CALC_MS || 20000)
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

    // 🛡️ VALIDAÇÃO TÉCNICA — roda antes de minimalismo pra ter o texto
    // bruto do LLM. Loga problemas detectados (modo monitoramento).
    // Se VALIDACAO_BLOQUEAR=true e severidade='critica', regenera 1×
    // com instrução de correção ou bloqueia com mensagem amigável.
    const validacao = validarRespostaTecnica(respostaBruta, mensagem);
    if (!validacao.valido) {
      const flags = validacao.problemas
        .map(p => `${p.tipo}${p.valor !== undefined ? `(${p.valor})` : ''}`)
        .join(', ');
      console.warn(
        `[VALIDACAO ${validacao.severidade}] ${flags}` +
        (validacao.ibEsperado ? ` | IB esp=${validacao.ibEsperado}A` : '')
      );
      validacao.problemas.forEach(p => {
        if (p.mensagem) console.warn(`  └─ ${p.mensagem}`);
      });
    }

    // ⚙️ PADRONIZAÇÃO SI — auto-corrige KW→kW, MM2→mm², VOLTS→V etc.
    // Não muda conteúdo técnico, só notação. Sempre aplicado.
    const respostaSI = corrigirUnidadesSI(respostaBruta);

    // 🤖 REMOVE FRASES ROBÓTICAS — "que ótima pergunta", "espero ter
    // ajudado", etc. Mesmo com instruções no prompt, LLM escapa.
    const respostaLimpa = removerFrasesRoboticas(respostaSI);

    // 🎯 MINIMALISMO: remove seções não pedidas pelo usuário
    const respostaMinimal = aplicarMinimalismo(respostaLimpa, mensagem);

    // ⚖️ DISCLAIMER RT/ART em respostas de cálculo determinístico
    const resposta = adicionarDisclaimerSeNecessario(respostaMinimal);

    console.log(
      `[TIMING] hist=${tHistorico - t0}ms llm=${tLLMEnd - tLLMStart}ms total=${Date.now() - t0}ms reasoning=${reasoningEffort} validacao=${validacao.severidade}`
    );

    // 🚨 BLOQUEIO em severidade crítica (apenas se VALIDACAO_BLOQUEAR=true).
    // Mantém resposta padrão do agente, mas adiciona aviso de revisão.
    if (VALIDACAO_BLOQUEAR && validacao.severidade === 'critica') {
      console.error(`[VALIDACAO BLOQUEIO] resposta com erro crítico — substituindo por aviso`);
      return `⚠️ *Detectei uma possível inconsistência no meu cálculo*

Pra evitar te orientar errado, preciso que você reformule a pergunta com mais detalhes (tensão, fases, tipo de carga) ou peça passo a passo.

Pra cálculo crítico, *valide com Engenheiro Eletricista (CREA Ativo + ART)*.`;
    }

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
