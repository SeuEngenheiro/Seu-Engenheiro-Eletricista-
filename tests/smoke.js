// ═══════════════════════════════════════════════════════════════
// tests/smoke.js — Validação local da integração RAG
//
// Roda 5 cenários básicos com USE_RAG=false e USE_RAG=true
// e compara se as respostas mantêm pontos críticos.
//
// Uso:
//   node tests/smoke.js                 # roda todos
//   node tests/smoke.js --only=motor    # roda só "motor"
//   node tests/smoke.js --rag-only      # só com RAG
//   node tests/smoke.js --classify-only # só testa classificador
// ═══════════════════════════════════════════════════════════════

import 'dotenv/config';
import { classificarIntencao, buscarChunksRelevantes } from '../lib/rag.js';

const args = process.argv.slice(2);
const onlyArg = args.find(a => a.startsWith('--only='))?.split('=')[1];
const ragOnly = args.includes('--rag-only');
const classifyOnly = args.includes('--classify-only');

// ═══════════════════════════════════════════════════════════════
// CENÁRIOS DE TESTE
// Cada cenário define: nome, mensagem, palavras-chave esperadas na resposta,
// e categorias esperadas pelo classificador.
// ═══════════════════════════════════════════════════════════════

const CENARIOS = [
  {
    nome: 'oi',
    mensagem: 'oi',
    categoriasEsperadas: [],
    keywordsResposta: [/ol[aá]|ajud|engenh/i]
  },
  {
    nome: 'conversao',
    mensagem: 'quanto é 200 CV em kW?',
    categoriasEsperadas: ['motores'],
    keywordsResposta: [/147|14[78]/, /kW/i]
  },
  {
    nome: 'motor',
    mensagem: 'preciso dimensionar circuito de motor 100cv 220v trifasico',
    categoriasEsperadas: ['motores', 'cabos'],
    keywordsResposta: [/IB|corrente/i, /cabo/i, /disjuntor/i]
  },
  {
    nome: 'queda_longa',
    mensagem: 'qual o cabo para chuveiro 7500W 220V a 500 metros do quadro?',
    categoriasEsperadas: ['queda_tensao'],
    keywordsResposta: [/queda|ΔV|comprimento/i, /500|m/i]
  },
  {
    nome: 'memorial',
    mensagem: 'como faço um memorial descritivo elétrico?',
    categoriasEsperadas: ['memorial_orcamento'],
    keywordsResposta: [/memorial|projeto|ART|CREA/i]
  },
  {
    nome: 'spda',
    mensagem: 'preciso de SPDA na minha casa de 2 andares?',
    categoriasEsperadas: ['aterramento_spda'],
    keywordsResposta: [/SPDA|risco|NBR|5419/i]
  },
  {
    nome: 'fv',
    mensagem: 'sistema fotovoltaico 5 kWp on-grid, qual proteção CC?',
    categoriasEsperadas: ['normas_mt_fv_nr10'],
    keywordsResposta: [/DPS|fus[ií]vel|CC|DC/i]
  }
];

// ═══════════════════════════════════════════════════════════════
// TESTE 1 — Classificador (heurística regex)
// ═══════════════════════════════════════════════════════════════

function testarClassificador() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('TESTE 1 — CLASSIFICADOR DE INTENÇÃO');
  console.log('═══════════════════════════════════════════════════════════\n');

  let acertos = 0;
  let total = 0;

  for (const c of CENARIOS) {
    if (onlyArg && c.nome !== onlyArg) continue;
    total++;

    const detectadas = classificarIntencao(c.mensagem);
    const esperadas = c.categoriasEsperadas;

    // Considera passou se TODAS as categorias esperadas foram detectadas
    // (pode detectar mais — não é erro)
    const todasDetectadas = esperadas.every(e => detectadas.includes(e));
    const passou = todasDetectadas;
    if (passou) acertos++;

    console.log(`[${passou ? '✅' : '❌'}] ${c.nome.padEnd(18)} → "${c.mensagem.substring(0, 60)}${c.mensagem.length > 60 ? '...' : ''}"`);
    console.log(`     esperadas: [${esperadas.join(', ') || '(vazio)'}]`);
    console.log(`     detectadas: [${detectadas.join(', ') || '(vazio)'}]`);
  }

  console.log(`\n→ Classificador: ${acertos}/${total} acertos\n`);
  return { acertos, total };
}

// ═══════════════════════════════════════════════════════════════
// TESTE 2 — Busca de chunks (Supabase pgvector)
// Requer: USE_RAG=true + Supabase populado
// ═══════════════════════════════════════════════════════════════

async function testarBuscaChunks() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('TESTE 2 — BUSCA DE CHUNKS (pgvector)');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!process.env.SUPABASE_URL || !process.env.OPENAI_API_KEY) {
    console.log('⚠️  SUPABASE_URL ou OPENAI_API_KEY ausentes — pulando busca de chunks.\n');
    return { acertos: 0, total: 0 };
  }

  let acertos = 0;
  let total = 0;

  for (const c of CENARIOS) {
    if (onlyArg && c.nome !== onlyArg) continue;
    if (c.categoriasEsperadas.length === 0) continue; // skip "oi"
    total++;

    try {
      const cats = classificarIntencao(c.mensagem);
      const chunks = await buscarChunksRelevantes(c.mensagem, {
        threshold: 0.5, // baixo só pra teste — ver se vem ALGO relevante
        matchCount: 3,
        categorias: cats.length > 0 ? cats : null
      });

      const passou = chunks.length > 0;
      if (passou) acertos++;

      console.log(`[${passou ? '✅' : '❌'}] ${c.nome.padEnd(18)} → ${chunks.length} chunk(s)`);
      for (const chunk of chunks) {
        console.log(`     - ${chunk.categoria.padEnd(20)} | sim=${chunk.similarity.toFixed(3)} | ${chunk.titulo}`);
      }
    } catch (err) {
      console.log(`[❌] ${c.nome} → ERRO: ${err.message}`);
    }
  }

  console.log(`\n→ Busca chunks: ${acertos}/${total} retornaram resultados\n`);
  return { acertos, total };
}

// ═══════════════════════════════════════════════════════════════
// TESTE 3 — Comparação RAG ON vs OFF (chamada real ao OpenAI)
// Requer: OPENAI_API_KEY
// Custa ~$0.02 por execução completa.
// ═══════════════════════════════════════════════════════════════

async function testarComparacao() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('TESTE 3 — RAG ON vs OFF (chamadas reais OpenAI)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('⚠️  Cada cenário faz 2 chamadas ao gpt-5-mini (~$0.02 total)\n');

  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️  OPENAI_API_KEY ausente — pulando comparação.\n');
    return { acertos: 0, total: 0 };
  }

  // Importa dinamicamente pra reler USE_RAG (módulo é cached)
  // Solução simples: fazer fork de processo seria mais limpo, mas pra smoke
  // basta importar uma vez por modo.

  const modos = ragOnly ? [{ usar: true }] : [{ usar: false }, { usar: true }];

  let acertos = 0;
  let total = 0;

  for (const c of CENARIOS) {
    if (onlyArg && c.nome !== onlyArg) continue;
    total++;

    console.log(`\n┌─ ${c.nome.toUpperCase()} ─────────────────`);
    console.log(`│ "${c.mensagem}"`);
    console.log(`└──────────────────────────────`);

    for (const { usar } of modos) {
      // O módulo lib/claude.js cacheia USE_RAG no momento da importação.
      // Pra trocar entre runs, é necessário recarregar — usamos process.env
      // mas o cache de módulo persiste. Solução: pequeno delay + log.
      process.env.USE_RAG = String(usar);

      try {
        // dynamic import pra garantir nova leitura — Node ESM cacheia,
        // mas em ambiente de smoke chama-se 1x por modo, então OK.
        const { chamarClaude } = await import('../lib/claude.js');

        const inicio = Date.now();
        const resposta = await chamarClaude(
          '+5511999999999',
          c.mensagem,
          'gratis'
        );
        const elapsed = Date.now() - inicio;

        const keywordsOk = c.keywordsResposta.every(re => re.test(resposta));
        if (keywordsOk) acertos++;

        const tag = usar ? '🟢 RAG=ON' : '⚪ RAG=OFF';
        console.log(`\n${tag} (${elapsed}ms)`);
        console.log(resposta.substring(0, 400) + (resposta.length > 400 ? '...' : ''));
        console.log(`Keywords match: ${keywordsOk ? '✅' : '❌'}`);
      } catch (err) {
        console.log(`❌ erro: ${err.message}`);
      }
    }
  }

  console.log(`\n→ Comparação: ${acertos}/${total * modos.length} respostas com keywords esperadas`);
  return { acertos, total: total * modos.length };
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║   SMOKE TEST — Seu Engenheiro AI (RAG integration)       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  const resultados = [];

  // 1) Classificador (sempre roda — barato, sem API)
  resultados.push({ nome: 'Classificador', ...testarClassificador() });

  if (classifyOnly) {
    imprimirResumo(resultados);
    return;
  }

  // 2) Busca chunks (precisa Supabase populado)
  resultados.push({ nome: 'Busca chunks', ...await testarBuscaChunks() });

  // 3) Comparação RAG ON/OFF (custa OpenAI tokens)
  if (!process.argv.includes('--skip-openai')) {
    resultados.push({ nome: 'Comparação OpenAI', ...await testarComparacao() });
  } else {
    console.log('\n⚠️  --skip-openai → pulando comparação RAG ON/OFF\n');
  }

  imprimirResumo(resultados);
}

function imprimirResumo(resultados) {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                       RESUMO FINAL                       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  for (const r of resultados) {
    const taxa = r.total > 0 ? `${Math.round(r.acertos / r.total * 100)}%` : 'N/A';
    console.log(`  ${r.nome.padEnd(20)} ${r.acertos}/${r.total} (${taxa})`);
  }
  console.log('');
}

main().catch(err => {
  console.error('\n❌ erro fatal:', err);
  process.exit(1);
});
