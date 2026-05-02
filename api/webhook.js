import {
  verificarOuCriarUsuario,
  verificarLimiteCalculos,
  verificarLimitePerguntas,
  verificarLimiteFotos,
  verificarLimiteBuscaPreco,
  registrarCalculo,
  registrarConversa,
  registrarPergunta,
  registrarFoto,
  registrarBuscaPreco,
  buscarHistorico,
  jaProcessouMensagem,
  marcarMensagemProcessada,
  proximoResetMensal
} from '../lib/supabase.js';
import { chamarClaude, analisarFoto, buscarPrecosIA, transcreverAudio } from '../lib/claude.js';
import { enviarMensagem } from '../lib/zapi.js';

// ⚙️ Aumenta timeout do Vercel pra 60s (suficiente pra Claude responder)
export const config = {
  maxDuration: 60,
};

const boasVindasEnviadas = new Map();
const TEMPO_SESSAO = 8 * 60 * 60 * 1000;

function jaEnviouBoasVindas(t) { const ts = boasVindasEnviadas.get(t); return ts && Date.now() - ts < TEMPO_SESSAO; }
function marcarBoasVindas(t) { boasVindasEnviadas.set(t, Date.now()); }

// Detecta saudações com flexibilidade (com ou sem pontuação, com complemento).
// IMPORTANTE: usa ([!?.,\s]|$) em vez de \b porque \b do JS não trata acentos
// como word char — 'olá' falhava no \b após o 'á'.
function isOla(msg) {
  const m = msg.toLowerCase().trim();
  return /^(oi|ol[aá]|hey|hello|e\s*a[íi]|salve|fala|bom\s+dia|boa\s+tarde|boa\s+noite|menu|in[íi]cio|come[çc]ar|start)([!?.,;:\s]|$)/.test(m);
}

// Identifica qual tipo de saudação foi usada pra ecoar de volta
function obterSaudacao(msg) {
  const m = msg.toLowerCase();
  if (m.includes('bom dia')) return 'Bom dia';
  if (m.includes('boa tarde')) return 'Boa tarde';
  if (m.includes('boa noite')) return 'Boa noite';
  return 'Olá';
}

// Monta a mensagem de boas-vindas — MESMO PADRÃO pra todos os planos.
// Linha do plano varia: Gratuito mostra contador X/20, Pro/Premium mostra nome.
// (Removidos emojis 👷‍♂️⚡ no início — pedido do usuário 02/05/2026.)
function montarBoasVindas(plano, saudacao, usados = 0) {
  let linhaPlano;
  if (plano === 'premium') {
    linhaPlano = '🔴 *Plano Premium:* acesso total — sem limites';
  } else if (plano === 'pro') {
    linhaPlano = '🔵 *Plano Profissional:* perguntas ilimitadas';
  } else {
    linhaPlano = `🟢 *Plano Gratuito:* ${usados}/20 perguntas/mês`;
  }
  return `${saudacao}! Eu sou o SEU ENGENHEIRO AI\n\nPosso te ajudar com qualquer dúvida ou problema elétrico, sempre seguindo as normas (NBR 5410 / NR-10).\n\n${linhaPlano}\n\nO que você precisa?`;
}
function ehCalculo(msg) {
  return /\b(calcul|dimens|corrente|queda.*tens|disjuntor|cabo\s*(para|de|mm)|motor|chuveiro|transformador|potência|capacitor|iluminância|\d+\s*(kva|kw|cv|hp|w)|\d+\s*v\s*(tri|mono|bi))\b/i.test(msg);
}
function ehPerguntaTecnica(msg) {
  return /\b(o\s*que\s*é|como\s*(funciona|fazer|instalar|ligar)|qual\s*(a\s*)?(diferença|norma|regra)|quando\s*usar|posso\s*usar|é\s*obrigatório|explica|me\s*fala|diferença\s*entre|para\s*que\s*serve)\b/i.test(msg);
}
function ehConversao(msg) {
  return /\b(convert(er|e|a)|transforma(r)?|quanto\s*é|em\s*(watts?|kw|cv|hp|volts?|amperes?|hz|rpm|°c|°f|kelvin|awg|mm²)|de\s*(cv|hp|kw|mw|kva|kwh|v|a|hz|rpm|°c|°f)\s*para)\b/i.test(msg);
}
function ehMaterial(msg) {
  // Bug fix (02/05/2026): regex original pegava "material" em qualquer
  // contexto, gerando falso positivo em perguntas técnicas tipo
  // "resistividade do material", "tipo de material condutor".
  // Quando isso acontecia, webhook desviava pra rota de lista de
  // materiais e bot anexava lista indevida na resposta.
  //
  // Nova regra: 2 estágios.
  //   1) Bloquear contextos físico-técnicos onde "material" é
  //      propriedade física (não pedido comercial).
  //   2) Aceitar APENAS frases com intenção comercial clara
  //      (lista, orçamento, comprar, materiais necessários, etc).
  const m = (msg || '').toLowerCase();

  // Estágio 1 — exclusões (contexto físico-técnico)
  const ehMaterialFisico =
    // "resistividade/tipo/propriedade/condutividade do material"
    /\b(resistividade|tipo|caracter[íi]stica|propriedade|densidade|coeficiente|condutividade|composi[çc][ãa]o|estrutura)\s+(do|de|dos|das)\s+material/i.test(m) ||
    // "material condutor/isolante/magnético/dielétrico/ferromagnético"
    /\bmaterial(?:\s+\w+)?\s+(condutor|isolant|magn[ée]tic|diel[ée]tric|ferromagn[ée]tic|paramagn[ée]tic|n[ãa]o\s+linear)/i.test(m) ||
    // "do material" como complemento físico isolado
    /\b(comportamento|aquecimento|temperatura|fadiga|dilata[çc][ãa]o)\s+(do|de|dos|das)\s+material/i.test(m);

  if (ehMaterialFisico) return false;

  // Estágio 2 — intenção comercial explícita
  return (
    /\blista\s+de\s+materia[il]s?\b/i.test(m) ||
    /\bor[çc]amento\b/i.test(m) ||
    /\b(quero|preciso|gostaria|posso)\s+comprar\b/i.test(m) ||
    /\b(o\s+que|que)\s+(eu\s+)?comprar\b/i.test(m) ||
    /\bmateria[il]s?\s+(necess[áa]rios?|para\s+(montar|instalar|comprar|obra|projeto|execu[çc][ãa]o)|de\s+(constru[çc][ãa]o|obra))\b/i.test(m) ||
    // "projeto" + "material" próximos = lista pra projeto
    /\bprojeto[^.]{0,40}materia[il]s?\b/i.test(m) ||
    /\bmateria[il]s?[^.]{0,40}projeto\b/i.test(m)
  );
}
function ehOutraNorma(msg) {
  return /\b(nr-10|nr10|nr-12|nr12|nr-33|nr33|nr-35|nr35|nbr\s*5419|nbr5419|nbr\s*5413|nbr5413|nbr\s*14039|nbr14039)\b/i.test(msg);
}

// Detecta agradecimentos / mensagens curtas de despedida (resposta instantânea)
function ehAgradecimento(msg) {
  const m = msg.toLowerCase().trim().replace(/[!?.,]+$/, '');
  return /^(obrigad[oa]|obg|valeu|vlw|tmj|tudo\s+bem|tudo\s+ok|brigad[oa]|tks|thank[ys]?|legal|bele[zs]a|tranquilo|certo|entendi|perfeito|massa|excelente|ot[ií]mo)([!?.,;:\s]|$)/.test(m);
}

const MSG_AGRADECIMENTO = `🤝 Por nada! Se precisar de mais alguma coisa elétrica, é só chamar.`;

// ═══════════════════════════════════════════════════════════════
// CONCEITOS FIXOS — respostas instantâneas pras perguntas mais comuns
// ═══════════════════════════════════════════════════════════════

const RESP_DR = `🔵 *DR — Diferencial Residual*

✅ *Resposta direta*
Dispositivo que desarma em <40 ms quando detecta fuga ≥30 mA pra terra.

🛠️ *Justificativa técnica*
Compara corrente entrando vs. saindo do circuito. Se diferença ≥ IΔn, é fuga (geralmente pra terra) e o DR desarma protegendo contra choque.

📋 *Norma*
NBR 5410 §5.1.3.2.2 — obrigatório em áreas molhadas, banheiros, cozinhas e tomadas externas.

💡 *Dica prática*
DR não substitui disjuntor — disjuntor → fios contra sobrecarga; DR → pessoas contra choque.

*Caso queira mais detalhes, é só pedir.*`;

const RESP_DPS = `🔵 *DPS — Dispositivo de Proteção contra Surtos*

✅ *Resposta direta*
Limita sobretensões transitórias (raios, manobras) pra proteger equipamentos.

🛠️ *Justificativa técnica*
Quando há pico de tensão, o DPS desvia a corrente pra terra evitando que chegue aos equipamentos.

📋 *Norma*
NBR 5410 §6.3.5 — obrigatório em entrada de instalações com SPDA ou em áreas com risco de raios.

📊 *Classes*
• Classe I: entrada da instalação (raios diretos)
• Classe II: quadro de distribuição (mais comum)
• Classe III: junto ao equipamento sensível

*Caso queira mais detalhes, é só pedir.*`;

const RESP_DISJUNTOR = `🔵 *Disjuntor — Conceito*

✅ *Resposta direta*
Dispositivo que protege fios contra sobrecarga e curto-circuito desligando automaticamente.

🛠️ *Justificativa técnica*
- Sobrecarga: corrente acima do nominal por tempo → desarme térmico
- Curto: pico instantâneo → desarme magnético

📋 *Norma*
NBR 5410 §5.3.4 + IEC 60898 (disjuntores residenciais).

📊 *Curvas comerciais*
• B → cargas resistivas (chuveiro, aquecedor)
• C → mistas residenciais (TUE, iluminação)
• D → motores e cargas com partida elevada

*Caso queira mais detalhes, é só pedir.*`;

const RESP_DIF_DR_DISJ = `🔵 *Disjuntor × DR — Diferenças*

✅ *Disjuntor*
• Protege FIOS contra sobrecarga e curto
• Detecta corrente excessiva
• NÃO protege contra choque

✅ *DR*
• Protege PESSOAS contra choque elétrico
• Detecta fuga de corrente pra terra (≥30 mA)
• NÃO protege contra sobrecarga ou curto

⚠️ *Importante*
Eles NÃO se substituem — você precisa dos DOIS na instalação.
NBR 5410 obriga ambos em áreas molhadas e tomadas externas.

*Caso queira mais detalhes, é só pedir.*`;

const RESP_TENSAO_BR = `🔵 *Tensão padrão no Brasil*

✅ *Resposta direta*
Depende da região:
• 127 V (monofásico) — RJ, ES, MG, parte do NE
• 220 V (monofásico) — SP, sul, PR, BA, parte do NE
• 220/380 V (trifásico) — industrial e residencial trifásico

📋 *Norma*
NBR 5440 (transformadores) e padrões da concessionária local.

💡 *Dica*
Sempre confirme com sua distribuidora local — varia inclusive entre cidades vizinhas.

*Caso queira mais detalhes, é só pedir.*`;

function ehPerguntaDR(msg) {
  return /\b(o\s+que\s+(é|e)\s+(um\s+)?dr|para\s+que\s+serve\s+(o\s+)?dr|conceito\s+(de|do)\s+dr|dr\s+(é|e)\s+(obrigat[óo]rio|necess[áa]rio)|preciso\s+de\s+dr|qual\s+(a\s+)?fun[çc][ãa]o\s+do\s+dr)\b/i.test(msg);
}
function ehPerguntaDPS(msg) {
  return /\b(o\s+que\s+(é|e)\s+(um\s+)?dps|para\s+que\s+serve\s+(o\s+)?dps|conceito\s+(de|do)\s+dps|dps\s+(é|e)\s+(obrigat[óo]rio|necess[áa]rio)|preciso\s+de\s+dps|qual\s+(a\s+)?fun[çc][ãa]o\s+do\s+dps)\b/i.test(msg);
}
function ehPerguntaDisjuntor(msg) {
  // Só captura quando é pergunta CONCEITUAL ("o que é"), não dimensionamento
  return /\b(o\s+que\s+(é|e)\s+(um\s+)?disjuntor|para\s+que\s+serve\s+(o\s+)?disjuntor|conceito\s+(de|do)\s+disjuntor|defini[çc][ãa]o\s+(de|do)\s+disjuntor)\b/i.test(msg);
}
function ehDiferencaDR(msg) {
  return /\b(diferen[çc]a\s+entre\s+(o\s+)?dr\s+e\s+(o\s+)?disjuntor|disjuntor\s+(e|vs|x|versus)\s+dr|dr\s+(e|vs|x|versus)\s+disjuntor|qual\s+a\s+diferen[çc]a\s+entre\s+(eles|disjuntor\s+e\s+dr))\b/i.test(msg);
}
function ehPerguntaTensaoBR(msg) {
  return /\b(qual\s+(a\s+)?tens[ãa]o\s+(do|no)\s+brasil|tens[ãa]o\s+(padr[ãa]o|comum)\s+(no\s+)?brasil|qual\s+(a\s+)?tens[ãa]o\s+da\s+rede)\b/i.test(msg);
}

// ═══════════════════════════════════════════════════════════════
// CÁLCULOS PARAMÉTRICOS — lookup direto sem LLM
// ═══════════════════════════════════════════════════════════════

// NBR 5410 Tabela 36 (Cu, PVC 70°C, B1, 2 cond. carregados, 30°C)
// Limite COMERCIAL: 300 mm². Acima disso → cabos em paralelo (NBR §6.2.6.4)
const TABELA_CABO = [
  [1.5, 17.5], [2.5, 24], [4, 32], [6, 41], [10, 57], [16, 76],
  [25, 101], [35, 125], [50, 151], [70, 192], [95, 232], [120, 269],
  [150, 309], [185, 353], [240, 415], [300, 477],
];
// Capacidade de referência do maior cabo comercial (300 mm² B1)
const IZ_300_MM2 = 477; // A
// Fator de agrupamento p/ N condutores em paralelo no mesmo eletroduto
// (NBR 5410 Tabela 42 — simplificado, lado seguro)
const FATOR_AGRUP = { 2: 0.80, 3: 0.70, 4: 0.65, 5: 0.60, 6: 0.57 };

const DISJUNTORES_COMERCIAIS = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630];

// ─────────────────────────────────────────────────────────────────
// Função NÚCLEO — dimensiona cabo a partir de IB já conhecido.
// Reusada por: tentarCaboPorAmperes, tentarTrafoCabo,
// tentarDisjuntorPorAmperesQtdCabos. Garante consistência total.
// ─────────────────────────────────────────────────────────────────

function dimensionarCabo(ib, titulo, contextoExtra = '') {
  // ── Caso 1: até 300 mm² (cabo único) ──────────────────────────
  const escolha = TABELA_CABO.find(([_, cap]) => cap >= ib);
  if (escolha) {
    return `*${titulo}*${contextoExtra}

⚡ *Resultado*
Cabo *${escolha[0]} mm²* (capacidade ${escolha[1]} A — NBR 5410 Tabela 36)

📌 *Obs.:* cobre, PVC 70°C, método B1 (eletroduto embutido), 30°C.
Para 90°C (EPR/XLPE) ou outros métodos, aplicar fatores.

⚠️ Verificar queda de tensão se distância >30 m.

*Caso queira mais detalhes, é só pedir.*`;
  }

  // ── Caso 2: > 300 mm² → cabos em paralelo (NBR §6.2.6.4) ──────
  for (let n = 2; n <= 6; n++) {
    const fator = FATOR_AGRUP[n];
    const capTotal = IZ_300_MM2 * n * fator;
    if (capTotal >= ib) {
      return `*${titulo}*${contextoExtra}

⚡ *Resultado*
*${n} cabos × 300 mm² em paralelo por fase*
Capacidade total ≈ ${Math.round(capTotal)} A
(${IZ_300_MM2} A × ${n} × ${fator} de agrupamento)

📌 *Por que paralelo?*
Bitolas acima de 300 mm² não são comerciais no Brasil.
NBR 5410 §6.2.6.4 permite cabos em paralelo, desde que:
• Mesmo material (Cu)
• Mesma seção (300 mm²)
• Mesmo comprimento e roteamento
• Mesmas conexões em ambas extremidades

🔧 *Atenção pro projeto*
• Cabo terra (PE) também ${n}× ou bitola maior proporcional
• Cabo neutro: trifásico balanceado pode ser N = ½ fase
• Disjuntor compatível com a corrente total (${ib} A)
• Validar com Engenheiro Eletricista (ART) — cabos em paralelo
  exigem cuidado extra na conexão (terminais, lugs, torques).

*Caso queira mais detalhes, é só pedir.*`;
    }
  }

  // ── Caso 3: > 6 cabos = revisar projeto ───────────────────────
  return `*${titulo}*${contextoExtra}

⚠️ *Corrente muito elevada (>${Math.round(IZ_300_MM2 * 6 * FATOR_AGRUP[6])} A)*

Mesmo com 6 cabos × 300 mm² em paralelo, a capacidade fica no
limite. Recomenda-se:
• *Barramento blindado* (busway) — padrão p/ correntes >2000 A
• *Subir a tensão* (380 V → 13,8 kV) reduz corrente proporcionalmente
• *Dividir a alimentação* em 2+ circuitos paralelos

📋 *Norma*
NBR 14039 (média tensão) ou NBR 5410 §6.2.6.4 (paralelos).
Projeto desse porte exige Engenheiro Eletricista com ART.

*Caso queira mais detalhes, é só pedir.*`;
}

// ─────────────────────────────────────────────────────────────────
// Bypass 1: "cabo pra X A"
// ─────────────────────────────────────────────────────────────────
function tentarCaboPorAmperes(msg) {
  const m = msg.match(/cabo\s+(?:p\/|para|de|pra)\s+(\d+(?:[.,]\d+)?)\s*a(?:mp[èeé]res?)?\b/i);
  if (!m) return null;
  const ib = parseFloat(m[1].replace(',', '.'));
  return dimensionarCabo(ib, `Cabo para ${ib} A`);
}

// ─────────────────────────────────────────────────────────────────
// Bypass 2: "trafo X kVA Y V" / "transformador X kVA Y V"
// Calcula corrente nominal e dimensiona cabo automaticamente.
// IB = S(kVA) × 1000 / (√3 × V) — assume sempre trifásico (padrão BR)
// ─────────────────────────────────────────────────────────────────
function tentarTrafoCabo(msg) {
  // Captura "trafo|transformador" + kVA + V (qualquer ordem entre, com palavras intermediárias)
  // Ex: "cabo pra trafo 500 kva 380v secundário"
  //     "transformador de 1000 kva em 380 v"
  //     "qual cabo trafo 750kva 220v tri"
  const m = msg.match(/(?:trafo|transformador)[\s\S]{0,80}?(\d+(?:[.,]\d+)?)\s*kva[\s\S]{0,30}?(\d+(?:[.,]\d+)?)\s*v(?:olt)?/i);
  if (!m) return null;
  const kva = parseFloat(m[1].replace(',', '.'));
  const v = parseFloat(m[2].replace(',', '.'));
  if (kva <= 0 || v <= 0) return null;
  const ibCalc = (kva * 1000) / (Math.sqrt(3) * v);
  const ib = Math.round(ibCalc * 10) / 10; // 1 casa decimal
  const titulo = `Cabo p/ trafo ${kva} kVA — ${v} V trifásico`;
  const contextoExtra = `\n\n📐 *Cálculo da corrente*\nIB = S / (√3 × V) = ${kva}.000 / (√3 × ${v}) ≈ *${ib} A*`;
  return dimensionarCabo(ib, titulo, contextoExtra);
}

// ─────────────────────────────────────────────────────────────────
// Bypass 3: "quantos cabos X mm² pra Y A"
// Aplica regra de agrupamento corretamente. Aceita variações:
//   "quantos cabos 240 mm² pra 759 a"
//   "quantos cabos de 300mm para 800 amperes"
//   "cabos 120mm² em paralelo pra 400a"
// ─────────────────────────────────────────────────────────────────
function tentarCabosBitolaQtd(msg) {
  const m = msg.match(/(?:quantos\s+)?cabos?\s+(?:de\s+)?(\d+(?:[.,]\d+)?)\s*mm[²2]?[\s\S]{0,30}?(?:p\/|pra|para)\s+(\d+(?:[.,]\d+)?)\s*a(?:mp[èeé]res?)?\b/i);
  if (!m) return null;
  const bitola = parseFloat(m[1].replace(',', '.'));
  const ib = parseFloat(m[2].replace(',', '.'));
  if (bitola <= 0 || ib <= 0) return null;

  const linha = TABELA_CABO.find(([b]) => b === bitola);
  if (!linha) return null; // bitola não comercial → deixa LLM tratar
  const izUnit = linha[1];

  // Caso A: 1 cabo basta
  if (izUnit >= ib) {
    return `*${bitola} mm² para ${ib} A*

⚡ *Resultado*
*1 cabo de ${bitola} mm² é suficiente* — capacidade ${izUnit} A ≥ ${ib} A.
Não precisa cabos em paralelo nesse caso.

📌 *Obs.:* assume PVC 70°C, B1, 30°C. Pra outras condições aplicar fatores.

*Caso queira mais detalhes, é só pedir.*`;
  }

  // Caso B: precisa N cabos em paralelo
  for (let n = 2; n <= 6; n++) {
    const fator = FATOR_AGRUP[n];
    const cap = izUnit * n * fator;
    if (cap >= ib) {
      return `*${bitola} mm² para ${ib} A*

⚡ *Resultado*
*${n} cabos × ${bitola} mm² em paralelo por fase*
Capacidade total ≈ ${Math.round(cap)} A
(${izUnit} A × ${n} × ${fator} agrupamento)

📌 *FATOR DE AGRUPAMENTO É OBRIGATÓRIO em paralelos*
NBR 5410 Tabela 42. Sem o fator, há risco de superaquecimento
e degradação da isolação. Fatores típicos no mesmo eletroduto:
• 2 cabos: 0,80
• 3 cabos: 0,70
• 4 cabos: 0,65
• 5 cabos: 0,60
• 6 cabos: 0,57

🔧 *Cabos em paralelo* (NBR §6.2.6.4):
• Mesmo material, seção e comprimento
• Mesma instalação e conexões
• PE também N× ou proporcional

⚠️ Validar com Engenheiro Eletricista (ART).

*Caso queira mais detalhes, é só pedir.*`;
    }
  }

  // Caso C: nem 6 cabos da bitola escolhida bastam → sugerir subir bitola
  return `*${bitola} mm² para ${ib} A*

⚠️ *Não atende com até 6 cabos × ${bitola} mm² em paralelo*

Capacidade máxima possível: ${Math.round(izUnit * 6 * FATOR_AGRUP[6])} A < ${ib} A.

Opções:
• Subir bitola pra *300 mm²* (maior comercial) e refazer o cálculo
• Barramento blindado (busway)
• Subir tensão (380 V → 13,8 kV) — reduz corrente proporcionalmente

📋 NBR 14039 (média tensão) ou Engenheiro Eletricista (ART).

*Caso queira mais detalhes, é só pedir.*`;
}

function tentarDisjuntorPorAmperes(msg) {
  const m = msg.match(/disjuntor\s+(?:p\/|para|de)\s+(\d+(?:[.,]\d+)?)\s*a(?:mp[èeé]res?)?\b/i);
  if (!m) return null;
  const ib = parseFloat(m[1].replace(',', '.'));
  const escolha = DISJUNTORES_COMERCIAIS.find(c => c >= ib);
  if (!escolha) return null;
  return `*Disjuntor para ${ib} A*

⚡ *Resultado*
Disjuntor *${escolha} A* (próximo valor comercial ≥ ${ib} A)

📌 *Obs.:* regra NBR 5410 → IB ≤ IN ≤ IZ.
- Curva C: cargas residenciais mistas (TUE, iluminação)
- Curva D: motores ou cargas com partida elevada

⚠️ Conferir se o cabo aguenta o disjuntor (capacidade do cabo ≥ IN).

*Caso queira mais detalhes, é só pedir.*`;
}

// Conversões simples — bypassa LLM pra resposta instantânea e exata
function tentarConversao(msg) {
  // CV → kW: "10 cv em/para kw"
  let m = msg.match(/(\d+(?:[.,]\d+)?)\s*cv\s+(em|para|para\s+converter|=>?)\s*kw/i);
  if (m) {
    const v = parseFloat(m[1].replace(',', '.'));
    return `✅ ${v} CV = ${(v * 0.736).toFixed(2)} kW (× 0,736)`;
  }
  // kW → CV
  m = msg.match(/(\d+(?:[.,]\d+)?)\s*kw\s+(em|para|=>?)\s*cv/i);
  if (m) {
    const v = parseFloat(m[1].replace(',', '.'));
    return `✅ ${v} kW = ${(v / 0.736).toFixed(2)} CV (÷ 0,736)`;
  }
  // HP → CV
  m = msg.match(/(\d+(?:[.,]\d+)?)\s*hp\s+(em|para|=>?)\s*cv/i);
  if (m) {
    const v = parseFloat(m[1].replace(',', '.'));
    return `✅ ${v} HP = ${(v * 1.0139).toFixed(2)} CV (× 1,0139)`;
  }
  // CV → HP
  m = msg.match(/(\d+(?:[.,]\d+)?)\s*cv\s+(em|para|=>?)\s*hp/i);
  if (m) {
    const v = parseFloat(m[1].replace(',', '.'));
    return `✅ ${v} CV = ${(v * 0.9863).toFixed(2)} HP (× 0,9863)`;
  }
  // kW → HP
  m = msg.match(/(\d+(?:[.,]\d+)?)\s*kw\s+(em|para|=>?)\s*hp/i);
  if (m) {
    const v = parseFloat(m[1].replace(',', '.'));
    return `✅ ${v} kW = ${(v * 1.341).toFixed(2)} HP (× 1,341)`;
  }
  // HP → kW
  m = msg.match(/(\d+(?:[.,]\d+)?)\s*hp\s+(em|para|=>?)\s*kw/i);
  if (m) {
    const v = parseFloat(m[1].replace(',', '.'));
    return `✅ ${v} HP = ${(v * 0.7457).toFixed(2)} kW (× 0,7457)`;
  }
  return null;
}

// Detecta pergunta "qual é meu plano atual" (precisa rodar ANTES de ehPlanos pra não confundir)
function ehPlanoAtual(msg) {
  return /\b(meu\s+plano|plano\s+atual|qual\s+(é|e|o|eh)\s+(o\s+)?meu\s+plano|que\s+plano\s+(eu\s+)?(tenho|uso|estou)|estou\s+(em\s+|no\s+)?(qual\s+)?plano|verificar\s+(o\s+)?(meu\s+)?plano|quanto\s+(eu\s+)?(falta|tenho|sobr)|ver\s+meu\s+plano|saber\s+(o\s+)?meu\s+plano)\b/i.test(msg);
}

// Monta resposta sobre o plano atual do usuário
function montarPlanoAtual(plano, restantes) {
  if (plano === 'premium') {
    return `📊 *Seu plano atual: 🔴 PREMIUM*\n\n✅ Acesso total liberado — sem limites:\n• Perguntas ilimitadas\n• 📷 Análise de fotos (até 30/dia)\n• 💰 Lista com preços atualizados\n• 📜 Histórico completo\n• 🏗️ Análise de projeto\n\nAproveite!`;
  }
  if (plano === 'pro') {
    return `📊 *Seu plano atual: 🔵 PROFISSIONAL*\n\n✅ Recursos ativos:\n• Perguntas ilimitadas\n• Cálculo passo a passo\n• Dimensionamento detalhado\n• Lista de materiais (sem preços)\n• Especificação técnica\n\n💡 Quer fotos + preços atualizados + histórico + análise de projeto?\n🔴 Faça upgrade pro *PREMIUM* (R$ 49,99/mês):\n👉 https://pay.kiwify.com.br/Mns2lfH`;
  }
  // Grátis
  const usados = 20 - (restantes ?? 20);
  const reset = proximoResetMensal();
  return `📊 *Seu plano atual: 🟢 GRATUITO*\n\n• 20 perguntas/mês — *${usados}/20 usadas* (${restantes ?? 20} restantes)\n• 🔄 Reset em *${reset}* (próximo mês)\n• Resposta técnica padrão\n• Direcionamento conforme NBR 5410\n\n💡 Quer perguntas ilimitadas + cálculos detalhados?\n🔵 *PROFISSIONAL* (R$ 24,99/mês):\n👉 https://pay.kiwify.com.br/mVAGqLU\n\n🔴 *PREMIUM* (R$ 49,99/mês):\n👉 https://pay.kiwify.com.br/Mns2lfH`;
}

// Boas-vindas geradas dinamicamente por montarBoasVindas() — adapta saudação ao plano + saudação detectada do usuário (Bom dia / Boa tarde / Olá)

// Mensagens de limite atingido — funções pra incluir data dinâmica do
// próximo reset (dia 1° do mês seguinte). Antes eram constantes e o
// usuário não sabia quando o saldo volta. Opção A escolhida em 02/05/2026:
// manter limite mensal (20) mas COMUNICAR com clareza.
function msgLimiteCalculos() {
  const reset = proximoResetMensal();
  return `⚠️ Você atingiu o limite de *20 perguntas/mês* do plano gratuito.\n\n🔄 *Reset:* ${reset} (próximo mês, à meia-noite).\n\nPra continuar sem limites agora:\n\n📊 *Planos — Seu Engenheiro AI*\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n🔵 *Plano Profissional — R$ 24,99/mês*\n• Perguntas ilimitadas\n• Cálculos ilimitados\n• Dimensionamento detalhado\n• Lista de materiais (SEM PREÇOS)\n• Especificação técnica de materiais\n👉 https://pay.kiwify.com.br/mVAGqLU\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n🔴 *Plano Premium — R$ 49,99/mês*\n• Tudo do Profissional\n• 💰 Lista de materiais (COM PREÇOS)\n• 📷 Análise de fotos ilimitada\n• 📜 Histórico completo acessível\n• 🏗️ Análise de projeto (fotos + planta)\n👉 https://pay.kiwify.com.br/Mns2lfH\n\n*✅ Pronto pra começar? Assine um plano agora.*`;
}

function msgLimitePerguntas() {
  const reset = proximoResetMensal();
  return `⚠️ Você atingiu o limite de *20 perguntas/mês* do plano gratuito.\n\n🔄 *Reset:* ${reset} (próximo mês, à meia-noite).\n\n🔵 PROFISSIONAL: https://pay.kiwify.com.br/mVAGqLU\n🔴 PREMIUM: https://pay.kiwify.com.br/Mns2lfH`;
}
const MSG_NORMA_BLOQUEADA = `📋 Outras normas disponíveis nos planos *PROFISSIONAL* e *PREMIUM*.\n\nNo grátis: *NBR 5410* incluída.\n\n🔵 PROFISSIONAL: https://pay.kiwify.com.br/mVAGqLU\n🔴 PREMIUM: https://pay.kiwify.com.br/Mns2lfH`;
const MSG_PLANOS = `📊 *Planos — Seu Engenheiro AI*\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n🟢 *Plano Gratuito — R$ 0*\n• 20 perguntas / mês\n• Resposta técnica padrão (modo curto)\n• Direcionamento conforme NBR 5410\n\nIndicado pra dúvidas simples e consultas rápidas.\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n🔵 *Plano Profissional — R$ 24,99/mês*\n• Perguntas ilimitadas\n• Cálculos ilimitados\n• Dimensionamento detalhado\n• Lista de materiais (SEM PREÇOS)\n• Especificação técnica de materiais\n\nIndicado pra quem executa serviços.\n\n👉 https://pay.kiwify.com.br/mVAGqLU\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n🔴 *Plano Premium — R$ 49,99/mês*\n• Tudo do Profissional\n• 💰 Lista de materiais (COM PREÇOS)\n• 📷 Análise de fotos ilimitada\n• 📜 Histórico completo acessível\n• 🏗️ Análise de projeto (fotos + planta)\n\nIndicado pra uso profissional e projetos.\n\n👉 https://pay.kiwify.com.br/Mns2lfH\n\n*✅ Pronto pra começar? Assine um plano agora.*`;

// ═══════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL — processa SINCRONICAMENTE com await
// Z-API espera resposta 200 dentro de ~30s. Vercel tem 60s.
// ═══════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const tStart = Date.now();
  try {
    const body = req.body;

    if (body.fromMe || body.isGroup) {
      return res.status(200).json({ ok: true });
    }

    // ═══════════════════════════════════════════════════════════
    // 🛡️ DEDUPLICAÇÃO ROBUSTA
    // ═══════════════════════════════════════════════════════════

    const messageId = body.messageId || body.id || body.message?.id || body.key?.id;

    if (!messageId) {
      console.warn('[WEBHOOK] Mensagem sem ID — body keys:', Object.keys(body || {}));
      return res.status(200).json({ ok: true });
    }

    const jaProcessou = await jaProcessouMensagem(messageId);
    if (jaProcessou) {
      console.log(`[DEDUP] ${messageId} já processada — ignorando`);
      return res.status(200).json({ ok: true, dedup: true });
    }

    await marcarMensagemProcessada(messageId);

    // ═══════════════════════════════════════════════════════════
    // ⚙️ DETECÇÃO DE TIPO (texto / áudio / imagem)
    // ═══════════════════════════════════════════════════════════

    const telefone = body.phone?.replace(/\D/g, '');
    const nome = body.senderName || 'Usuário';
    const temImagem = !!(body.image || body.imageMessage);
    const temAudio = !!(body.audio || body.audioMessage);

    let mensagem = (body.text?.message || body.caption || '').trim();

    // ═══ TRANSCRIÇÃO DE ÁUDIO ═══
    if (temAudio && !mensagem) {
      try {
        const audioUrl = body.audio?.audioUrl || body.audioMessage?.url;
        const audioBase64 = body.audio?.base64 || body.audioMessage?.base64;
        const mimeType = body.audio?.mimeType || 'audio/ogg';

        let audioBuffer;
        if (audioBase64) {
          audioBuffer = Buffer.from(audioBase64, 'base64');
        } else if (audioUrl) {
          const audioRes = await fetch(audioUrl);
          audioBuffer = Buffer.from(await audioRes.arrayBuffer());
        } else {
          throw new Error('Áudio sem URL ou base64');
        }

        console.log('[AUDIO] Transcrevendo áudio...');
        mensagem = await transcreverAudio(audioBuffer, mimeType);
        console.log('[AUDIO] Transcrição:', mensagem);

      } catch (err) {
        console.error('[ERRO AUDIO]', err);
        await enviarMensagem(telefone, `Não consegui entender o áudio. Pode digitar a pergunta?`);
        return res.status(200).json({ ok: true });
      }
    }

    if (!telefone || (!mensagem && !temImagem)) {
      return res.status(200).json({ ok: true });
    }

    const usuario = await verificarOuCriarUsuario(telefone, nome);
    const plano = usuario?.plano || 'gratis';

    // ═══ FOTO ═══
    if (temImagem) {
      const limFoto = await verificarLimiteFotos(telefone, plano);
      if (!limFoto.permitido) {
        const msg = plano !== 'premium'
          ? `📸 Análise de fotos disponível APENAS no plano *PREMIUM*.\n\n🔴 PREMIUM (R$ 49,99/mês): https://pay.kiwify.com.br/Mns2lfH`
          : `⚠️ Limite de *30 fotos diárias* do PREMIUM atingido.\n\nVolte amanhã ou aguarde o reset à meia-noite.`;
        await enviarMensagem(telefone, msg);
        return res.status(200).json({ ok: true });
      }
      try {
        const imagemUrl = body.image?.imageUrl || body.imageMessage?.url;
        const imagemBase64 = body.image?.base64 || body.imageMessage?.base64;
        const mimeType = body.image?.mimeType || 'image/jpeg';
        let base64 = imagemBase64;
        if (!base64 && imagemUrl) {
          const imgRes = await fetch(imagemUrl);
          base64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
        }
        const resposta = await analisarFoto(telefone, base64, mimeType, plano);
        await registrarFoto(telefone);
        await registrarConversa(telefone, '[foto]', 'usuario');
        await registrarConversa(telefone, resposta, 'agente');
        await enviarMensagem(telefone, resposta);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[ERRO FOTO]', err);
        await enviarMensagem(telefone, `Não consegui analisar a foto. Tente novamente! 😊`);
        return res.status(200).json({ ok: true });
      }
    }

    // Registra conversa do usuário em background (fire-and-forget) —
    // não precisa esperar pra processar. Economiza ~100ms no caminho crítico.
    const prefixoAudio = temAudio ? '[áudio] ' : '';
    registrarConversa(telefone, prefixoAudio + mensagem, 'usuario').catch(e =>
      console.error('[REGISTRAR USUARIO]', e?.message)
    );
    const msg = mensagem.toLowerCase().trim();

    // ═══ BOAS-VINDAS ═══
    // SEMPRE responde a saudações (sem cooldown) ecoando a saudação do usuário.
    // Garante que NUNCA caia no LLM e gere texto inventado.
    if (isOla(mensagem)) {
      marcarBoasVindas(telefone);
      const saudacao = obterSaudacao(mensagem);
      // Pra plano grátis, mostra contador X/20 perguntas no mês
      let usados = 0;
      if (plano === 'gratis') {
        const lim = await verificarLimiteCalculos(telefone);
        usados = 20 - (lim.restantes ?? 20);
      }
      const texto = montarBoasVindas(plano, saudacao, usados);
      await enviarMensagem(telefone, texto);
      await registrarConversa(telefone, texto, 'agente');
      return res.status(200).json({ ok: true });
    }

    // ═══ HISTÓRICO ═══
    if (/^(histórico|historico|meus cálculos|meus calculos)$/.test(msg)) {
      if (plano !== 'premium') {
        await enviarMensagem(telefone, `Histórico disponível no plano *PREMIUM*.\n\n🔴 https://pay.kiwify.com.br/Mns2lfH`);
        return res.status(200).json({ ok: true });
      }
      const historico = await buscarHistorico(telefone, 10);
      if (!historico.length) {
        await enviarMensagem(telefone, `Você ainda não realizou nenhum cálculo! 😊`);
        return res.status(200).json({ ok: true });
      }
      let resp = `📋 *Seus últimos ${historico.length} cálculos:*\n\n`;
      historico.forEach((c, i) => { resp += `${i+1}. *${c.tipo_calculo||'Cálculo'}* — ${new Date(c.realizado_em).toLocaleDateString('pt-BR')}\n`; });
      await enviarMensagem(telefone, resp);
      await registrarConversa(telefone, resp, 'agente');
      return res.status(200).json({ ok: true });
    }

    // ═══ AGRADECIMENTO ═══ (resposta instantânea, sem LLM)
    if (ehAgradecimento(msg)) {
      await enviarMensagem(telefone, MSG_AGRADECIMENTO);
      await registrarConversa(telefone, MSG_AGRADECIMENTO, 'agente');
      return res.status(200).json({ ok: true });
    }

    // ═══ CONCEITOS FIXOS ═══ (DR, DPS, Disjuntor — respostas imutáveis)
    let respConceito = null;
    if (ehDiferencaDR(msg))           respConceito = RESP_DIF_DR_DISJ;
    else if (ehPerguntaDR(msg))       respConceito = RESP_DR;
    else if (ehPerguntaDPS(msg))      respConceito = RESP_DPS;
    else if (ehPerguntaDisjuntor(msg)) respConceito = RESP_DISJUNTOR;
    else if (ehPerguntaTensaoBR(msg)) respConceito = RESP_TENSAO_BR;
    if (respConceito) {
      await enviarMensagem(telefone, respConceito);
      await registrarConversa(telefone, respConceito, 'agente');
      return res.status(200).json({ ok: true });
    }

    // ═══ CONVERSÃO SIMPLES ═══ (CV/kW/HP — bypassa LLM)
    const respConversao = tentarConversao(msg);
    if (respConversao) {
      await enviarMensagem(telefone, respConversao);
      await registrarConversa(telefone, respConversao, 'agente');
      return res.status(200).json({ ok: true });
    }

    // ═══ CABO/DISJUNTOR PARAMÉTRICO ═══ (lookup tabela NBR 5410, sem LLM)
    // Ordem importa: trafo PRIMEIRO (regex específica), depois bitola+amperes,
    // depois "cabo pra X A" genérico.
    const respTrafo = tentarTrafoCabo(msg);
    if (respTrafo) {
      await enviarMensagem(telefone, respTrafo);
      await registrarConversa(telefone, respTrafo, 'agente');
      return res.status(200).json({ ok: true });
    }
    const respBitolaQtd = tentarCabosBitolaQtd(msg);
    if (respBitolaQtd) {
      await enviarMensagem(telefone, respBitolaQtd);
      await registrarConversa(telefone, respBitolaQtd, 'agente');
      return res.status(200).json({ ok: true });
    }
    const respCabo = tentarCaboPorAmperes(msg);
    if (respCabo) {
      await enviarMensagem(telefone, respCabo);
      await registrarConversa(telefone, respCabo, 'agente');
      return res.status(200).json({ ok: true });
    }
    const respDisj = tentarDisjuntorPorAmperes(msg);
    if (respDisj) {
      await enviarMensagem(telefone, respDisj);
      await registrarConversa(telefone, respDisj, 'agente');
      return res.status(200).json({ ok: true });
    }

    // ═══ PLANO ATUAL DO USUÁRIO ═══ (vem ANTES de PLANOS pra capturar "qual meu plano")
    if (ehPlanoAtual(msg)) {
      const lim = await verificarLimiteCalculos(telefone);
      const texto = montarPlanoAtual(plano, lim.restantes);
      await enviarMensagem(telefone, texto);
      await registrarConversa(telefone, texto, 'agente');
      return res.status(200).json({ ok: true });
    }

    // ═══ PLANOS ═══
    // Detecção CONTEXTUAL — exige palavra ligada a plano/assinatura.
    // Antes capturava 'qual o valor' isolado e dava falso positivo em
    // perguntas técnicas como 'qual o valor ideal de resistência'.
    // Detecção CONTEXTUAL — captura "planos" plural (quase sempre comercial)
    // exceto contextos técnicos (planos de instalação/aterramento/etc).
    // Para "plano" singular, exige contexto comercial explícito.
    const ehPlanosPlural = /\bplanos\b/i.test(msg);
    const ehPlanoTecnico = /\bplanos?\s+de\s+(instala|aterra|el[ée]tric|projet|trabal|estudo|tomada|circuit|emerg|prote[çc]|ilumina|distribui|carga|obra|montag|ataca|reform|seguran)/i.test(msg);
    const ehPergPlanos = (
      // "planos" plural sem contexto técnico
      (ehPlanosPlural && !ehPlanoTecnico) ||
      // "plano" singular sozinho ou com pontuação
      /^plano[!?.,;:\s]*$/i.test(msg) ||
      // Ações claras de assinatura/contratação
      /\bquero\s+(assinar|contratar|fazer\s+upgrade)\b/i.test(msg) ||
      /\b(assinar|contratar)\s+(o\s+|um\s+)?(plano|profissional|premium)\b/i.test(msg) ||
      /\bfazer\s+upgrade\b/i.test(msg) ||
      // Preço/valor com contexto comercial
      /\bquanto\s+custa\s+(o\s+plano|a\s+assinatura|profissional|premium|p(ra|ara)\s+(assinar|usar|contratar))\b/i.test(msg) ||
      /\bvalores?\s+dos?\s+planos?\b/i.test(msg) ||
      /\bpre[çc]os?\s+(do|dos|da|de)\s+(plano|assinatura)\b/i.test(msg)
    );
    if (ehPergPlanos) {
      await enviarMensagem(telefone, MSG_PLANOS);
      await registrarConversa(telefone, MSG_PLANOS, 'agente');
      return res.status(200).json({ ok: true });
    }

    // ═══ NORMA BLOQUEADA ═══
    if (plano === 'gratis' && ehOutraNorma(msg)) {
      await enviarMensagem(telefone, MSG_NORMA_BLOQUEADA);
      await registrarConversa(telefone, MSG_NORMA_BLOQUEADA, 'agente');
      return res.status(200).json({ ok: true });
    }

    // ═══ MATERIAIS COM PREÇOS (PREMIUM) ═══
    if (ehMaterial(msg)) {
      if (plano === 'premium') {
        const limite = await verificarLimiteBuscaPreco(telefone);
        if (!limite.permitido) {
          await enviarMensagem(telefone, `⚠️ Limite de *7 buscas de preços diárias* atingido.\n\nTente novamente amanhã!`);
          return res.status(200).json({ ok: true });
        }
        try {
          const resposta = await buscarPrecosIA(telefone, mensagem, plano);
          await registrarBuscaPreco(telefone);
          await registrarConversa(telefone, resposta, 'agente');
          await enviarMensagem(telefone, resposta);
          return res.status(200).json({ ok: true });
        } catch {
          await enviarMensagem(telefone, `Não consegui buscar preços agora. Tente novamente! 😊`);
          return res.status(200).json({ ok: true });
        }
      } else {
        const resposta = await chamarClaude(telefone, mensagem + '\n[Gerar lista de materiais SEM preços — plano grátis/PRO]', plano);
        await registrarConversa(telefone, resposta, 'agente');
        await enviarMensagem(telefone, resposta);
        return res.status(200).json({ ok: true });
      }
    }

    // ═══ CONVERSÕES ═══
    if (ehConversao(msg)) {
      const resposta = await chamarClaude(telefone, mensagem, plano);
      await Promise.all([
        enviarMensagem(telefone, resposta),
        registrarConversa(telefone, resposta, 'agente')
      ]);
      console.log(`[WEBHOOK CONV ${Date.now() - tStart}ms]`);
      return res.status(200).json({ ok: true });
    }

    // ═══ CÁLCULOS ═══
    if (ehCalculo(msg)) {
      if (plano === 'gratis') {
        const limite = await verificarLimiteCalculos(telefone);
        if (!limite.permitido) {
          const txt = msgLimiteCalculos();
          await enviarMensagem(telefone, txt);
          await registrarConversa(telefone, txt, 'agente');
          return res.status(200).json({ ok: true });
        }
      }
      const resposta = await chamarClaude(telefone, mensagem, plano);
      // Envia ao usuário e grava registros em paralelo
      await Promise.all([
        enviarMensagem(telefone, resposta),
        registrarCalculo(telefone, 'calculo', { mensagem }, { resposta }),
        registrarConversa(telefone, resposta, 'agente')
      ]);
      console.log(`[WEBHOOK CALC ${Date.now() - tStart}ms]`);
      return res.status(200).json({ ok: true });
    }

    // ═══ PERGUNTAS TÉCNICAS ═══
    if (plano === 'gratis' && ehPerguntaTecnica(msg)) {
      const limite = await verificarLimitePerguntas(telefone);
      if (!limite.permitido) {
        const txt = msgLimitePerguntas();
        await enviarMensagem(telefone, txt);
        await registrarConversa(telefone, txt, 'agente');
        return res.status(200).json({ ok: true });
      }
      await registrarPergunta(telefone, mensagem);
    }

    // ═══ IA RESPONDE ═══
    const resposta = await chamarClaude(telefone, mensagem, plano);
    // Z-API e log do agente em PARALELO — usuário recebe mais rápido
    await Promise.all([
      enviarMensagem(telefone, resposta),
      registrarConversa(telefone, resposta, 'agente')
    ]);
    console.log(`[WEBHOOK TOTAL ${Date.now() - tStart}ms] msg="${mensagem.slice(0, 60)}"`);
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error(`[ERRO WEBHOOK ${Date.now() - tStart}ms]`, err?.message || err);

    // Tenta avisar o usuário em vez de ficar em silêncio.
    // Re-extrai telefone do body (não está no escopo do catch) e envia
    // mensagem amigável dependendo do tipo de erro.
    try {
      const body = req.body || {};
      const telefone = body.phone?.replace(/\D/g, '');
      if (telefone && !body.fromMe && !body.isGroup) {
        const eTimeout = /demorei demais|aborted|timeout/i.test(err?.message || '');
        const msgFallback = eTimeout
          ? `⏱️ *Tô levando mais que o normal pra responder essa.*

Pode tentar de novo? Se preferir, divida em partes:
• 1 cálculo por vez (ex: "calcula motor 10cv 220v")
• Pergunte primeiro o que quer (cabo? disjuntor? quadro?)
• Mande dados objetivos (tensão, potência, área)`
          : `😬 *Tive um problema técnico aqui.*

Pode tentar de novo daqui um minuto? Se persistir, me avisa que apuro.`;
        await enviarMensagem(telefone, msgFallback);
        // Não bloqueia em registrar — fire-and-forget
        registrarConversa(telefone, msgFallback, 'agente').catch(() => {});
      }
    } catch (fallbackErr) {
      console.error('[FALLBACK ERRO]', fallbackErr?.message);
    }

    return res.status(200).json({ ok: false, error: err.message });
  }
}
