// ═══════════════════════════════════════════════════════════════
// lib/dadosFaltantes.js — Detector de dados faltantes
//
// Sprint 2.2 (02/05/2026): em vez de chutar valores quando o usuário
// não informa tudo, o bot PERGUNTA. Esse módulo detecta o tipo de
// pergunta + quais campos críticos faltam e formata uma resposta
// pedindo os dados de forma direta.
//
// Princípio: melhor admitir limitação que arriscar valor errado.
// ═══════════════════════════════════════════════════════════════

/**
 * Analisa a mensagem e retorna lista de campos faltantes para o
 * cálculo solicitado, ou null se a pergunta tem dados suficientes
 * (ou não é uma pergunta de cálculo claro).
 *
 * Retorna { tipo, faltantes: [{campo, exemplos}], mensagemPergunta }
 * ou null.
 */
export function detectarDadosFaltantes(mensagem) {
  const m = (mensagem || '').toLowerCase();

  // ── Padrões dos campos comuns ──────────────────────────────────
  const temTensao =
    /\b\d+(?:[.,]\d+)?\s*v(?:olts?)?\b/i.test(m) ||
    /\b(127|220|380|440)\b/.test(m);
  const temFases =
    /\b(mono|monof[aá]sic|bif[aá]sic|trif[aá]sic|tri\b|fase\s+(?:e\s+neutro|fase))/i.test(m);
  const temPotencia =
    /\b\d+(?:[.,]\d+)?\s*(w|kw|kva|cv|hp|btu)\b/i.test(m);
  const temCorrente =
    /\b\d+(?:[.,]\d+)?\s*a(?:mp[èeé]res?)?\b/i.test(m);
  const temComprimento =
    /\b\d+(?:[.,]\d+)?\s*m(?:etros?)?\b/i.test(m);
  const temMetodoInstalacao =
    /\b(eletroduto|bandeja|condulete|embutido|aparente|enterrado|subterr[aâ]neo|conduite|epr|xlpe|pvc|m[ée]todo\s+[abcdef]\b|b1|b2)/i.test(m);

  // ── Detector 1: Cabo SEM dados ─────────────────────────────────
  if (
    /\b(qual\s+(?:o\s+)?cabo|que\s+cabo|cabo\s+(?:certo|ideal|para))/i.test(m) &&
    !/\bcabo\s+(?:p\/|para|de|pra)\s+\d+\s*a/i.test(m)
  ) {
    const faltantes = [];
    if (!temPotencia && !temCorrente) faltantes.push({ campo: 'Potência ou corrente da carga', exemplos: '7500 W, 32 A, 5 kW' });
    if (!temTensao) faltantes.push({ campo: 'Tensão nominal', exemplos: '127V, 220V ou 380V' });
    if (!temComprimento) faltantes.push({ campo: 'Comprimento do circuito', exemplos: 'em metros, do quadro até o ponto' });
    if (faltantes.length >= 2) {
      return {
        tipo: 'cabo_sem_dados',
        faltantes,
        mensagemPergunta: montarPerguntaCabo(faltantes)
      };
    }
  }

  // ── Detector 2: Disjuntor SEM dados ────────────────────────────
  if (
    /\b(qual\s+(?:o\s+)?disjuntor|que\s+disjuntor|disjuntor\s+(?:certo|ideal|para))/i.test(m) &&
    !/\bdisjuntor\s+(?:p\/|para|de|pra)\s+\d+\s*a/i.test(m)
  ) {
    const faltantes = [];
    if (!temPotencia && !temCorrente) faltantes.push({ campo: 'Potência ou corrente da carga', exemplos: '7500 W, 5 kW, 32 A' });
    if (!temTensao) faltantes.push({ campo: 'Tensão nominal', exemplos: '127V, 220V ou 380V' });
    if (faltantes.length >= 2) {
      return {
        tipo: 'disjuntor_sem_dados',
        faltantes,
        mensagemPergunta: montarPerguntaDisjuntor(faltantes)
      };
    }
  }

  // ── Detector 3: Motor SEM tensão/fases ─────────────────────────
  if (
    /\bmotor\s*(?:de\s+)?\d+(?:[.,]\d+)?\s*(cv|hp|kw)\b/i.test(m) &&
    !temTensao
  ) {
    const faltantes = [
      { campo: 'Tensão nominal', exemplos: '220V, 380V ou 440V trifásico' }
    ];
    if (!temFases) faltantes.push({ campo: 'Tipo de partida', exemplos: 'direta (DOL), estrela-triângulo, soft-starter ou VFD' });
    return {
      tipo: 'motor_sem_tensao',
      faltantes,
      mensagemPergunta: montarPerguntaMotor(faltantes)
    };
  }

  // ── Detector 4: Queda de tensão SEM comprimento ────────────────
  if (
    /\bqueda\s+de\s+tens[aã]o\b/i.test(m) &&
    !temComprimento
  ) {
    const faltantes = [
      { campo: 'Comprimento do circuito', exemplos: 'em metros' }
    ];
    if (!temPotencia && !temCorrente) faltantes.push({ campo: 'Corrente ou potência da carga', exemplos: '20 A, 5 kW' });
    if (!temTensao) faltantes.push({ campo: 'Tensão nominal', exemplos: '127V, 220V, 380V' });
    return {
      tipo: 'queda_sem_comprimento',
      faltantes,
      mensagemPergunta: montarPerguntaQueda(faltantes)
    };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// Mensagens profissionais — uma por tipo de cálculo.
// Estrutura: título + lista com negrito + linha técnica final
// (cita norma/método pra demonstrar competência).
// ═══════════════════════════════════════════════════════════════

function listaCampos(faltantes) {
  return faltantes.map(f => `• *${f.campo}* — ${f.exemplos}`).join('\n');
}

function montarPerguntaCabo(faltantes) {
  return `🔌 *Dimensionamento de cabo*

Pra calcular a bitola correta preciso de:

${listaCampos(faltantes)}

Com esses dados aplico a Tabela 36 da NBR 5410 e verifico queda de tensão.`;
}

function montarPerguntaDisjuntor(faltantes) {
  return `⚡ *Dimensionamento de disjuntor*

Preciso saber:

${listaCampos(faltantes)}

Aplico a regra IB ≤ IN ≤ IZ (NBR 5410 §5.3) pra escolher o disjuntor.`;
}

function montarPerguntaMotor(faltantes) {
  return `⚙️ *Dimensionamento de motor*

Pra calcular IB e proteção preciso de:

${listaCampos(faltantes)}

Calculo IB = P/(√3·V·η·cosφ), seleciono cabo (NBR 5410) e disjuntor curva D.`;
}

function montarPerguntaQueda(faltantes) {
  return `📐 *Cálculo de queda de tensão*

Preciso de:

${listaCampos(faltantes)}

Aplico ΔV% = (√3·ρ·L·IB)/(S·V)·100. Limites NBR 5410: 4% TUE/força, 2% iluminação.`;
}
