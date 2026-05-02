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
  // Pergunta tipo "qual cabo pra X" sem tensão/comprimento/método
  if (
    /\b(qual\s+(?:o\s+)?cabo|que\s+cabo|cabo\s+(?:certo|ideal|para))/i.test(m) &&
    !/\bcabo\s+(?:p\/|para|de|pra)\s+\d+\s*a/i.test(m) // exclui "cabo pra X A" (bypass paramétrico)
  ) {
    const faltantes = [];
    if (!temPotencia && !temCorrente) faltantes.push({ campo: 'potência ou corrente', exemplos: '7500 W, 32 A, 5 kW' });
    if (!temTensao) faltantes.push({ campo: 'tensão', exemplos: '127V, 220V, 380V' });
    if (!temComprimento) faltantes.push({ campo: 'comprimento do circuito', exemplos: '15 m, 30 m, 80 m' });
    if (faltantes.length >= 2) {
      return {
        tipo: 'cabo_sem_dados',
        faltantes,
        mensagemPergunta: montarPergunta('Pra dimensionar o cabo certo preciso de:', faltantes)
      };
    }
  }

  // ── Detector 2: Disjuntor SEM dados ────────────────────────────
  if (
    /\b(qual\s+(?:o\s+)?disjuntor|que\s+disjuntor|disjuntor\s+(?:certo|ideal|para))/i.test(m) &&
    !/\bdisjuntor\s+(?:p\/|para|de|pra)\s+\d+\s*a/i.test(m) // exclui bypass
  ) {
    const faltantes = [];
    if (!temPotencia && !temCorrente) faltantes.push({ campo: 'potência da carga', exemplos: '7500 W, 5 kW, 32 A' });
    if (!temTensao) faltantes.push({ campo: 'tensão', exemplos: '127V, 220V, 380V' });
    if (faltantes.length >= 2) {
      return {
        tipo: 'disjuntor_sem_dados',
        faltantes,
        mensagemPergunta: montarPergunta('Pra te dar o disjuntor certo preciso de:', faltantes)
      };
    }
  }

  // ── Detector 3: Motor SEM tensão/fases ─────────────────────────
  // "calcula motor 50cv" sem dizer tensão/fases
  if (
    /\bmotor\s*(?:de\s+)?\d+(?:[.,]\d+)?\s*(cv|hp|kw)\b/i.test(m) &&
    !temTensao
  ) {
    const faltantes = [
      { campo: 'tensão', exemplos: '220V, 380V, 440V' }
    ];
    if (!temFases) faltantes.push({ campo: 'partida', exemplos: 'direta, estrela-triângulo, soft-starter, VFD' });
    return {
      tipo: 'motor_sem_tensao',
      faltantes,
      mensagemPergunta: montarPergunta('Pra dimensionar o motor preciso de:', faltantes)
    };
  }

  // ── Detector 4: Queda de tensão SEM comprimento ────────────────
  if (
    /\bqueda\s+de\s+tens[aã]o\b/i.test(m) &&
    !temComprimento
  ) {
    const faltantes = [
      { campo: 'comprimento do circuito (metros)', exemplos: '15 m, 50 m, 100 m' }
    ];
    if (!temPotencia && !temCorrente) faltantes.push({ campo: 'corrente ou potência', exemplos: '20 A, 5 kW' });
    if (!temTensao) faltantes.push({ campo: 'tensão', exemplos: '127V, 220V, 380V' });
    return {
      tipo: 'queda_sem_comprimento',
      faltantes,
      mensagemPergunta: montarPergunta('Pra calcular queda de tensão preciso de:', faltantes)
    };
  }

  return null;
}

/**
 * Formata pergunta amigável e direta:
 *
 *   Pra dimensionar X preciso de:
 *
 *   - Tensão (127V, 220V, 380V)
 *   - Comprimento do circuito (15 m, 30 m, 80 m)
 *
 *   Manda esses dados que eu calculo certo.
 */
function montarPergunta(introducao, faltantes) {
  const itens = faltantes.map(f => `- ${f.campo} (${f.exemplos})`).join('\n');
  return `${introducao}\n\n${itens}\n\nManda esses dados que eu calculo certo.`;
}
