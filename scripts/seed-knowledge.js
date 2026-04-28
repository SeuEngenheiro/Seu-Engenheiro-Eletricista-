// ═══════════════════════════════════════════════════════════════
// seed-knowledge.js
// Lê knowledge/*.md, gera embeddings (text-embedding-3-small)
// e faz upsert em knowledge_chunks (Supabase + pgvector).
//
// Uso: node scripts/seed-knowledge.js
// Pré-requisitos: rodar migrations/001_pgvector.sql no Supabase.
// Idempotente: re-executar atualiza embeddings sem duplicar.
// ═══════════════════════════════════════════════════════════════

import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const KNOWLEDGE_DIR = join(__dirname, '..', 'knowledge');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Mapeamento arquivo → categoria (usado pelo classificador de intenção)
const CATEGORIAS = {
  '01-cabos-condutores.md':     'cabos',
  '02-disjuntores-protecao.md': 'protecao',
  '03-quedas-tensao.md':        'queda_tensao',
  '04-motores-vfd.md':          'motores',
  '05-aterramento-spda.md':     'aterramento_spda',
  '06-iluminacao-tomadas.md':   'iluminacao_tomadas',
  '07-memorial-orcamento.md':   'memorial_orcamento',
  '08-normas-mt-fv-nr10.md':    'normas_mt_fv_nr10'
};

async function gerarEmbedding(texto) {
  const resp = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texto,
    encoding_format: 'float'
  });
  return resp.data[0].embedding;
}

function estimarTokens(texto) {
  // Estimativa simples: ~4 chars por token em pt-BR
  return Math.ceil(texto.length / 4);
}

async function processarChunk(arquivo) {
  const path = join(KNOWLEDGE_DIR, arquivo);
  const conteudo = readFileSync(path, 'utf-8');
  const categoria = CATEGORIAS[arquivo];

  if (!categoria) {
    console.warn(`⚠️  Sem categoria mapeada para ${arquivo}, pulando.`);
    return;
  }

  // Título = primeira linha "# ..."
  const tituloMatch = conteudo.match(/^#\s+(.+)$/m);
  const titulo = tituloMatch ? tituloMatch[1].trim() : arquivo;
  const tokens = estimarTokens(conteudo);

  console.log(`📄 ${arquivo}`);
  console.log(`   categoria: ${categoria}`);
  console.log(`   título:    ${titulo}`);
  console.log(`   tokens~:   ${tokens}`);
  console.log(`   gerando embedding...`);

  const embedding = await gerarEmbedding(conteudo);

  // Upsert por título (UNIQUE constraint na tabela)
  const { error } = await supabase
    .from('knowledge_chunks')
    .upsert(
      {
        categoria,
        titulo,
        conteudo,
        embedding,
        tokens,
        atualizado_em: new Date().toISOString()
      },
      { onConflict: 'titulo' }
    );

  if (error) {
    console.error(`   ❌ erro:`, error.message);
    throw error;
  }

  console.log(`   ✅ inserido/atualizado`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('SEED DA BASE DE CONHECIMENTO — knowledge_chunks');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY não definida no .env');
    process.exit(1);
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_URL ou SUPABASE_SERVICE_KEY não definidas no .env');
    process.exit(1);
  }

  const arquivos = readdirSync(KNOWLEDGE_DIR)
    .filter(f => f.endsWith('.md'))
    .sort();

  console.log(`Encontrados ${arquivos.length} chunks em ${KNOWLEDGE_DIR}\n`);

  let total = 0;
  for (const arquivo of arquivos) {
    try {
      await processarChunk(arquivo);
      total++;
    } catch (err) {
      console.error(`Falhou em ${arquivo}:`, err.message);
    }
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`✅ Concluído: ${total}/${arquivos.length} chunks processados`);
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
