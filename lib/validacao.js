// ═══════════════════════════════════════════════════════════════
// lib/validacao.js — Validação técnica programática
//
// Roda APÓS o LLM gerar a resposta, ANTES de enviar ao usuário.
// Detecta erros técnicos comuns (bitola inexistente, disjuntor não
// comercial, norma inválida, IB divergente) e loga severidade.
//
// Fase 1: modo MONITORAMENTO (só loga, não bloqueia).
// Após calibragem com dados reais, evolui para BLOQUEIO em severidade
// crítica (ex: IB divergente >15%, bitola inexistente).
// ═══════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────
// LISTAS DE REFERÊNCIA (NBR 5410 / mercado brasileiro)
// ──────────────────────────────────────────────────────────────

// Bitolas comerciais Cu (NBR 5410 Tabela 36/37)
// Acima de 300 mm² → cabos em paralelo (NBR §6.2.6.4)
const BITOLAS_COMERCIAIS = new Set([
  0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95,
  120, 150, 185, 240, 300
]);

// Disjuntores comerciais (IEC/NBR — gama padrão DIN)
const DISJUNTORES_COMERCIAIS = new Set([
  6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 70, 80, 100, 125, 160,
  200, 225, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500
]);

// NBRs vigentes que o agente pode citar
const NBRS_VALIDAS = new Set([
  '5410',  // BT
  '14039', // MT
  '5419',  // SPDA
  '5413',  // Iluminância
  '14136', // Plugues e tomadas (NBR 14136)
  '5418',  // Áreas classificadas
  '5471',  // Condutores elétricos
  '13534', // Estabelecimentos de saúde
  '13570', // Locais de afluência de público
  '14039', // Média tensão
  '7117',  // Resistividade do solo
  '15287', // Backup de energia
  '16690', // Microgeração
]);

// NRs que o agente pode citar
const NRS_VALIDAS = new Set(['1', '6', '10', '12', '18', '23', '26', '33', '35']);

// Padronização SI (KW → kW, MM2 → mm², etc)
// NOTA: AWG NÃO é auto-substituído (validarAWG já detecta como problema).
// Auto-substituir AWG → mm² duplicaria o texto: "300 AWG" virava "300 mm²"
// mas se já tinha "mm²" antes vira "mm² mm²".
const SUBSTITUICOES_SI = [
  { ruim: /\bKW\b/g,            certa: 'kW' },
  { ruim: /\bKVA\b/g,           certa: 'kVA' },
  { ruim: /\bMm2\b/g,           certa: 'mm²' },     // só ASCII '2'
  { ruim: /\bMM2\b/g,           certa: 'mm²' },
  { ruim: /\bmm2\b/g,           certa: 'mm²' },
  { ruim: /\bvolts?\b/gi,       certa: 'V' },
  { ruim: /\bamper(es?)?\b/gi,  certa: 'A' },
  { ruim: /\bohms?\b/gi,        certa: 'Ω' },
  { ruim: /\bhert?z\b/gi,       certa: 'Hz' },
];

// ──────────────────────────────────────────────────────────────
// 1) EXTRATOR DE CONTEXTO — detecta o que o usuário perguntou
// ──────────────────────────────────────────────────────────────

/**
 * Detecta tipo de cálculo na pergunta e extrai parâmetros.
 * Retorna { tipo, ...params } ou { tipo: 'outro' }.
 */
export function extrairContextoPergunta(mensagem) {
  const m = (mensagem || '').toLowerCase();

  // ── Motor: "motor de X CV em/com Y V (tri/mono)" ──
  // Aceita variações: 10cv, 10 cv, 10CV, 220v, 220V, em/de/com
  const motorMatch = m.match(
    /motor[^.]{0,40}?(\d+(?:[.,]\d+)?)\s*cv[^.]{0,40}?(\d+(?:[.,]\d+)?)\s*v/i
  );
  if (motorMatch) {
    const cv = parseFloat(motorMatch[1].replace(',', '.'));
    const v = parseFloat(motorMatch[2].replace(',', '.'));
    const fases = /\bmono(?:f[aá]sico)?\b/i.test(m) ? 1 : 3;
    return { tipo: 'motor', cv, v, fases };
  }

  // ── Trafo: "trafo X kVA Y V" ──
  const trafoMatch = m.match(
    /(?:trafo|transformador)[^.]{0,80}?(\d+(?:[.,]\d+)?)\s*kva[^.]{0,30}?(\d+(?:[.,]\d+)?)\s*v/i
  );
  if (trafoMatch) {
    const kva = parseFloat(trafoMatch[1].replace(',', '.'));
    const v = parseFloat(trafoMatch[2].replace(',', '.'));
    return { tipo: 'trafo', kva, v, fases: 3 };
  }

  // ── Chuveiro: "chuveiro X W em Y V" ──
  const chuveiroMatch = m.match(
    /chuveiro[^.]{0,40}?(\d+(?:[.,]\d+)?)\s*w[^.]{0,40}?(\d+(?:[.,]\d+)?)\s*v/i
  );
  if (chuveiroMatch) {
    const w = parseFloat(chuveiroMatch[1].replace(',', '.'));
    const v = parseFloat(chuveiroMatch[2].replace(',', '.'));
    if (w >= 1000) return { tipo: 'chuveiro', w, v, fases: 1 };
  }

  // ── Carga genérica trifásica: "X kW em Y V trifásico/tri" ──
  const cargaTriMatch = m.match(
    /(\d+(?:[.,]\d+)?)\s*kw[^.]{0,40}?(\d+(?:[.,]\d+)?)\s*v[^.]{0,20}?(?:tri|trif[aá]sic)/i
  );
  if (cargaTriMatch) {
    const kw = parseFloat(cargaTriMatch[1].replace(',', '.'));
    const v = parseFloat(cargaTriMatch[2].replace(',', '.'));
    return { tipo: 'carga_tri', kw, v, fases: 3 };
  }

  return { tipo: 'outro' };
}

// ──────────────────────────────────────────────────────────────
// 2) CALCULADORA DETERMINÍSTICA — IB esperado
// ──────────────────────────────────────────────────────────────

/**
 * Calcula corrente nominal (IB) em A baseado no contexto.
 * Retorna número ou null se contexto não suportado.
 *
 * Premissas (ajustáveis se usuário fornecer):
 *   Motor: cosφ=0,86, η=0,93 (típico WEG IR3)
 *   Carga: cosφ=0,92 (mista)
 */
export function calcularIBEsperado(ctx) {
  if (!ctx || ctx.tipo === 'outro') return null;

  if (ctx.tipo === 'motor') {
    const kw = ctx.cv * 0.736;
    const cosphi = 0.86;
    const eta = 0.93;
    if (ctx.fases === 3) {
      return (kw * 1000) / (Math.sqrt(3) * ctx.v * cosphi * eta);
    }
    return (kw * 1000) / (ctx.v * cosphi * eta);
  }

  if (ctx.tipo === 'trafo') {
    return (ctx.kva * 1000) / (Math.sqrt(3) * ctx.v);
  }

  if (ctx.tipo === 'chuveiro') {
    // Chuveiro = carga resistiva pura (cosφ=1)
    return ctx.w / ctx.v;
  }

  if (ctx.tipo === 'carga_tri') {
    const cosphi = 0.92;
    return (ctx.kw * 1000) / (Math.sqrt(3) * ctx.v * cosphi);
  }

  return null;
}

// ──────────────────────────────────────────────────────────────
// 3) VALIDADORES INDIVIDUAIS
// ──────────────────────────────────────────────────────────────

function validarBitolas(resposta) {
  const problemas = [];
  // Captura "X mm²" / "X mm2" — usa lookahead em vez de \b porque '²'
  // (superscript Unicode) NÃO é word-char no JS regex, então \b após ²
  // não funciona quando o que vem depois também é não-word (espaço).
  const bitolas = [...resposta.matchAll(/(\d+(?:[.,]\d+)?)\s*mm[²2](?!\d)/gi)];
  for (const match of bitolas) {
    const bit = parseFloat(match[1].replace(',', '.'));
    if (!BITOLAS_COMERCIAIS.has(bit) && bit > 0.5) {
      problemas.push({
        tipo: 'bitola_nao_comercial',
        severidade: 'alta',
        valor: bit,
        contexto: match[0].trim(),
        mensagem: `Bitola ${bit} mm² não é comercial no Brasil. Acima de 300 mm² usar paralelo.`
      });
    }
  }
  return problemas;
}

/**
 * Detecta padrões PERIGOSOS de cálculo de cabos em paralelo SEM
 * aplicar fator de agrupamento. Esse foi o erro real reportado em
 * 02/05/2026: bot disse "2 cabos × 415 = 830 A → suficiente" sem
 * aplicar fator 0,80 (capacidade real era 664 A < 759 A pedido).
 *
 * Padrões detectados:
 *   - "X × Y A" ou "X × Y mm²" próximo de "= Z A"
 *   - "em paralelo" sem mencionar "fator" ou nº conhecido (0,80/70/65/60/57)
 *   - Multiplicação de Iz × N sem redução
 */
function validarParaleloComFator(resposta) {
  const problemas = [];
  const r = resposta.toLowerCase();

  const mencionaParalelo =
    /\bem\s+paralelo\b/i.test(r) ||
    /\d+\s*[x×]\s*\d+\s*mm[²2]/i.test(r) ||
    /\d+\s*cabos?\s+(?:de\s+|em\s+)?\d/i.test(r);

  if (!mencionaParalelo) return problemas;

  // Tem que mencionar fator OU número conhecido
  const mencionaFator =
    /\bfator(?:\s+de\s+agrupamento)?\b/i.test(r) ||
    /\b0[,.](?:80|70|65|60|57)\b/.test(r) ||
    /\b(?:0,8|0,7|0,65|0,6|0,57)\b/.test(r);

  if (!mencionaFator) {
    problemas.push({
      tipo: 'paralelo_sem_fator_agrupamento',
      severidade: 'critica',
      mensagem: 'Resposta menciona cabos em paralelo MAS não cita fator de agrupamento (NBR 5410 Tabela 42). Risco de superdimensionar — capacidade real é menor que Iz × N.'
    });
  }

  return problemas;
}

function validarAWG(resposta) {
  if (/\bAWG\b/i.test(resposta)) {
    return [{
      tipo: 'awg_padrao_americano',
      severidade: 'alta',
      mensagem: 'AWG é padrão americano, no Brasil usar mm².'
    }];
  }
  return [];
}

function validarNormas(resposta) {
  const problemas = [];
  // NBR XXXX
  const nbrs = [...resposta.matchAll(/NBR\s*0?(\d{3,5})/gi)];
  for (const match of nbrs) {
    if (!NBRS_VALIDAS.has(match[1])) {
      problemas.push({
        tipo: 'nbr_desconhecida',
        severidade: 'media',
        valor: 'NBR ' + match[1],
        mensagem: `NBR ${match[1]} não está na lista vigente conhecida.`
      });
    }
  }
  // NR-XX
  const nrs = [...resposta.matchAll(/\bNR[-\s]?(\d{1,2})\b/gi)];
  for (const match of nrs) {
    if (!NRS_VALIDAS.has(match[1])) {
      problemas.push({
        tipo: 'nr_desconhecida',
        severidade: 'media',
        valor: 'NR-' + match[1]
      });
    }
  }
  return problemas;
}

function validarDisjuntores(resposta) {
  const problemas = [];
  // "disjuntor X A" — captura número até 30 chars depois de "disjuntor"
  // Padrão tolerante: "disjuntor de 32 A", "disjuntor 32A", "disjuntor *32 A*"
  const matches = [...resposta.matchAll(
    /disjuntor[^.\n]{0,50}?(\d+(?:[.,]\d+)?)\s*A\b/gi
  )];
  for (const match of matches) {
    const aN = parseFloat(match[1].replace(',', '.'));
    if (!DISJUNTORES_COMERCIAIS.has(aN) && aN >= 6) {
      problemas.push({
        tipo: 'disjuntor_nao_comercial',
        severidade: 'alta',
        valor: aN,
        contexto: match[0].trim(),
        mensagem: `Disjuntor ${aN} A não é da gama comercial padrão.`
      });
    }
  }
  return problemas;
}

function validarIB(resposta, mensagemUsuario) {
  const ctx = extrairContextoPergunta(mensagemUsuario);
  const ibEsperado = calcularIBEsperado(ctx);
  if (!ibEsperado) return { problemas: [], ctx, ibEsperado: null };

  // Procura "IB ≈/= X A" com label EXPLÍCITO. Sem label, NÃO tenta inferir
  // (caso contrário pode pegar "Disjuntor 45 A" como sendo IB e gerar
  // falso positivo de divergência).
  let ibLLM = null;
  const ibLabel = resposta.match(
    /\b(?:IB|In(?!\s*=\s*\d+\s*$)|i\s*nominal|corrente\s+(?:nominal|de\s+projeto|de\s+entrada))\s*[≈=~:]?\s*(\d+(?:[.,]\d+)?)\s*A\b/i
  );
  if (ibLabel) {
    ibLLM = parseFloat(ibLabel[1].replace(',', '.'));
  }

  if (!ibLLM) return { problemas: [], ctx, ibEsperado: Math.round(ibEsperado) };

  const diff = Math.abs(ibLLM - ibEsperado) / ibEsperado;
  const problemas = [];

  // Tolerância calibrada por tipo de cálculo:
  // - Motor: 20% (cosφ 0,80-0,92, η 85-96% variam entre fabricantes)
  // - Trafo: 5%  (fórmula determinística IB = S/(√3·V), sem variáveis)
  // - Chuveiro: 5% (resistivo puro)
  const tolerancia =
    ctx.tipo === 'motor'    ? 0.20 :
    ctx.tipo === 'trafo'    ? 0.05 :
    ctx.tipo === 'chuveiro' ? 0.05 :
                              0.15;

  if (diff > tolerancia) {
    problemas.push({
      tipo: 'ib_divergente',
      severidade: 'critica',
      ib_llm: ibLLM,
      ib_esperado: Math.round(ibEsperado),
      diff_pct: (diff * 100).toFixed(1),
      tolerancia_pct: (tolerancia * 100).toFixed(0),
      ctx_pergunta: ctx,
      mensagem: `Corrente do LLM (${ibLLM} A) diverge ${(diff * 100).toFixed(1)}% do calculado (${Math.round(ibEsperado)} A) — tolerância ${(tolerancia * 100).toFixed(0)}%.`
    });
  }
  return { problemas, ctx, ibEsperado: Math.round(ibEsperado) };
}

function validarUnidadesSI(resposta) {
  const problemas = [];
  for (const { ruim, certa } of SUBSTITUICOES_SI) {
    if (ruim.test(resposta)) {
      problemas.push({
        tipo: 'unidade_formato_si',
        severidade: 'baixa',
        valor: certa,
        mensagem: `Unidade fora do padrão SI — auto-corrigida para ${certa}.`
      });
    }
  }
  return problemas;
}

// ──────────────────────────────────────────────────────────────
// 4) ORQUESTRADOR — função pública principal
// ──────────────────────────────────────────────────────────────

/**
 * Valida resposta técnica completa.
 * Retorna { valido, severidade, problemas, contextoPergunta, ibEsperado }
 *
 * Severidades (ordem decrescente):
 *   critica → IB divergente >15% (cálculo numérico errado)
 *   alta    → bitola não comercial, AWG, disjuntor não comercial
 *   media   → norma desconhecida
 *   baixa   → unidade fora do SI (corrigível automaticamente)
 *   ok      → tudo certo
 */
export function validarRespostaTecnica(resposta, mensagemUsuario) {
  if (!resposta || typeof resposta !== 'string') {
    return { valido: false, severidade: 'critica', problemas: [{ tipo: 'resposta_vazia' }] };
  }

  const ibCheck = validarIB(resposta, mensagemUsuario);

  const problemas = [
    ...validarBitolas(resposta),
    ...validarAWG(resposta),
    ...validarNormas(resposta),
    ...validarDisjuntores(resposta),
    ...validarParaleloComFator(resposta),
    ...validarUnidadesSI(resposta),
    ...ibCheck.problemas
  ];

  const severidades = problemas.map(p => p.severidade);
  const severidade =
    severidades.includes('critica') ? 'critica' :
    severidades.includes('alta')    ? 'alta'    :
    severidades.includes('media')   ? 'media'   :
    severidades.includes('baixa')   ? 'baixa'   :
                                      'ok';

  return {
    valido: problemas.length === 0,
    severidade,
    problemas,
    contextoPergunta: ibCheck.ctx,
    ibEsperado: ibCheck.ibEsperado
  };
}

/**
 * Aplica correção automática de unidades SI no texto.
 * (Não modifica conteúdo técnico — só padroniza notação.)
 */
export function corrigirUnidadesSI(texto) {
  if (!texto) return texto;
  let r = texto;
  for (const { ruim, certa } of SUBSTITUICOES_SI) {
    r = r.replace(ruim, certa);
  }
  return r;
}
