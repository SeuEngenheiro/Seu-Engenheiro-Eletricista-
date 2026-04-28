// ═══════════════════════════════════════════════════════════════
// lib/rag.js — Retrieval-Augmented Generation
//
// 3 funções públicas:
//   - classificarIntencao(msg)     → categorias relevantes
//   - buscarChunksRelevantes(msg)  → top-K do pgvector
//   - buscarCache(msg) / salvarCache(msg, resposta)
//
// Embedding model: text-embedding-3-small (1536 dim, OpenAI)
// Cache threshold: 0.95 (quase idêntico)
// Chunks threshold: 0.75 (similaridade semântica)
// ═══════════════════════════════════════════════════════════════

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ═══════════════════════════════════════════════════════════════
// CLASSIFICAÇÃO DE INTENÇÃO — heurística por regex
//
// Retorna array de categorias relevantes (pode ser múltiplas).
// Categorias casam com seed-knowledge.js / chunks knowledge/*.md
// ═══════════════════════════════════════════════════════════════

const REGEX_CATEGORIAS = [
  {
    categoria: 'cabos',
    patterns: [
      /\bcabo[s]?\b/i, /\bcondutor[es]?\b/i, /\bse[cç][aã]o\b/i,
      /\bmm[²2]\b/i, /\btabela\s*3[67]\b/i, /\bpvc\b/i, /\bxlpe\b/i,
      /\bepr\b/i, /\bhepr\b/i, /\bcobre\b|\balum[ií]nio\b/i,
      /\bagrupamento\b/i, /\beletroduto\b/i, /\bbandeja\b/i,
      /\bIZ\b/i, /\bcapacidade\s+de\s+cond/i
    ]
  },
  {
    categoria: 'protecao',
    patterns: [
      /\bdisjuntor[es]?\b/i, /\bcurva\s*[bcd]\b/i, /\bIcu\b|\bIcn\b/i,
      /\bcurto[\s-]?circuito\b/i, /\bIk\b/i, /\bDR\b/i, /\bDPS\b/i,
      /\bdiferencial\b/i, /\bsurto[s]?\b/i, /\bsobrecarga\b/i,
      /\bsobrecorrente\b/i, /\bvaristor\b/i, /\bMOV\b/i,
      /\b30\s*m[aA]\b/i, /\btipo\s+[abf]\b/i, /\bsensibilidade\b/i,
      /\bIB\s*[≤<=]\s*IN\s*[≤<=]\s*IZ\b/i
    ]
  },
  {
    categoria: 'queda_tensao',
    patterns: [
      /\bqueda\s+de\s+tens[aã]o\b/i, /\b[Δ∆]V\b/i,
      /\bdelta\s*v\b/i, /\bdv\s*%/i, /\bcomprimento\b/i,
      /\bdist[aâ]ncia\b/i, /\bresistividade\b/i, /\bρ\b|\brho\b/i,
      /\b4\s*%\b.*\b(tue|for[cç]a)\b/i, /\b2\s*%\b.*\bilumin/i,
      /\b7\s*%\b.*total/i, /\b\d{2,}\s*m(?:etros)?\b/i
    ]
  },
  {
    categoria: 'motores',
    patterns: [
      /\bmotor[es]?\b/i, /\bcv\b|\bhp\b/i, /\bkw\b/i,
      /\bpartida\s+(direta|estrela|dol|y[\s-]?Δ|y[\s-]?delta|soft)/i,
      /\bsoft[\s-]?start/i, /\bvfd\b/i, /\binversor\s+de\s+frequ/i,
      /\bcontactor\b|\bcontator\b/i, /\brel[eé]\s+t[eé]rmico\b/i,
      /\brendimento\b|\bη\b|\beta\b/i,
      /\bfator\s+de\s+pot[eê]ncia\b|\bfp\b|\bcos\s*φ\b|\bcosfi\b/i,
      /\bharm[oô]nica/i, /\bbanco\s+de\s+capacitor/i,
      /\bIp\s*\/\s*In\b/i, /\bcorrente\s+de\s+partida\b/i
    ]
  },
  {
    categoria: 'aterramento_spda',
    patterns: [
      /\baterramento\b/i, /\bSPDA\b/i, /\bp[aá]ra[\s-]?raio/i,
      /\bdesc[ao]rga\s+atmosf/i, /\bequipotencializa/i,
      /\bBEP\b/i, /\bhaste\b.*\b(terra|aterr)/i,
      /\bmalha\s+de\s+terra\b/i, /\bTN[\s-]?[scs]?\b/i,
      /\bIT\b/i, /\bTT\b/i, /\bPE\b/i, /\bPEN\b/i,
      /\bNBR\s*5419\b/i, /\bLPS\s*[IV]+\b/i,
      /\besfera\s+rolante\b/i, /\bgaiola\s+de\s+faraday\b/i
    ]
  },
  {
    categoria: 'iluminacao_tomadas',
    patterns: [
      /\bilumina[cç][aã]o\b/i, /\bilumin[aâ]ncia\b/i, /\blux\b/i,
      /\blumen[s]?\b|\blumin[aá]ria/i, /\bL[Ee][Dd]\b/i,
      /\btomada[s]?\b/i, /\bTUG\b|\bTUE\b/i, /\binterruptor[es]?\b/i,
      /\bchuveiro\b/i, /\bar[\s-]?condicionado\b|\bsplit\b/i,
      /\bcircuito[s]?\s+terminal/i, /\bem[\s-]?h[aá]bita/i,
      /\bNBR\s*5413\b/i, /\bilumina[cç][aã]o\s+de\s+emerg/i
    ]
  },
  {
    categoria: 'memorial_orcamento',
    patterns: [
      /\bmemorial\b/i, /\bdescritivo\b/i, /\bART\b/i,
      /\borcamento\b|\bor[cç]amento\b/i, /\bquanto\s+custa\b/i,
      /\bpre[cç]o[s]?\b/i, /\blista\s+de\s+materia/i,
      /\bquantitativo\b/i, /\bBDI\b/i, /\bcronograma\b/i,
      /\bprojeto\s+complet/i, /\bunifilar\b/i, /\bQGBT\b/i,
      /\bCREA\b/i, /\bresponsabilidade\s+t[eé]cnica\b/i
    ]
  },
  {
    categoria: 'normas_mt_fv_nr10',
    patterns: [
      /\b(NBR\s*)?14039\b/i, /\bm[eé]dia\s+tens[aã]o\b/i, /\bMT\b/i,
      /\bsubesta[cç][aã]o\b/i, /\bcab[ií]ne\s+prim[aá]ria/i,
      /\bcub[ií]culo\b/i, /\bansi\s*5[019]/i, /\bTC\s*\/\s*TP\b/i,
      /\btransformador\s+de\s+(corrente|potencial)\b/i,
      /\bfotovoltaic/i, /\bFV\b/i, /\bsolar\b/i, /\bpainel\s+solar\b/i,
      /\bm[oó]dulo\s+solar\b/i, /\bm[oó]dulo\s+fotovolta/i,
      /\binversor\s+(string|h[ií]brido|central)/i, /\bstring\s*box\b/i,
      /\bmicroinversor\b/i, /\bon[\s-]?grid\b|\boff[\s-]?grid\b/i,
      /\bNBR\s*16690\b/i, /\bLei\s*14\.?300\b/i,
      /\bREN\s*1\.?000\b|\bANEEL\b/i, /\bPRODIST\b/i,
      /\bHSP\b/i, /\bgera[cç][aã]o\s+distribu/i,
      /\bNR[\s-]?10\b/i, /\bdesenergiza[cç][aã]o\b/i,
      /\bLOTO\b/i, /\bAPR\b/i, /\bPT\b.*\bel[eé]tric/i,
      /\bEPI[s]?\b/i, /\bzona\s+de\s+risco\b/i,
      /\barco\s+el[eé]tric/i
    ]
  }
];

export function classificarIntencao(mensagem) {
  if (!mensagem || mensagem.length < 3) return [];

  const categorias = new Set();
  for (const { categoria, patterns } of REGEX_CATEGORIAS) {
    if (patterns.some(p => p.test(mensagem))) {
      categorias.add(categoria);
    }
  }

  return Array.from(categorias);
}

// ═══════════════════════════════════════════════════════════════
// EMBEDDING — text-embedding-3-small (1536 dim)
// ═══════════════════════════════════════════════════════════════

async function gerarEmbedding(texto) {
  const resp = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texto.substring(0, 8000), // safety: limit input
    encoding_format: 'float'
  });
  return resp.data[0].embedding;
}

// ═══════════════════════════════════════════════════════════════
// BUSCA DE CHUNKS RELEVANTES — RPC match_knowledge_chunks
// ═══════════════════════════════════════════════════════════════

export async function buscarChunksRelevantes(mensagem, opts = {}) {
  const {
    threshold = 0.75,
    matchCount = 3,
    categorias = null
  } = opts;

  try {
    const embedding = await gerarEmbedding(mensagem);

    // Se categorias informadas, busca em cada uma; senão busca global
    if (categorias && categorias.length > 0) {
      const promessas = categorias.map(cat =>
        supabase.rpc('match_knowledge_chunks', {
          query_embedding: embedding,
          match_threshold: threshold,
          match_count: matchCount,
          filter_categoria: cat
        })
      );

      const resultados = await Promise.all(promessas);
      const chunks = [];
      for (const r of resultados) {
        if (r.error) {
          console.error('[RAG] erro busca categoria:', r.error.message);
          continue;
        }
        chunks.push(...(r.data || []));
      }

      // Dedup por id, ordena por similaridade desc
      const unicos = Array.from(
        new Map(chunks.map(c => [c.id, c])).values()
      ).sort((a, b) => b.similarity - a.similarity);

      return unicos.slice(0, matchCount * 2); // até 2x match_count se múltiplas cats
    }

    // Busca global (sem filtro de categoria)
    const { data, error } = await supabase.rpc('match_knowledge_chunks', {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: matchCount,
      filter_categoria: null
    });

    if (error) {
      console.error('[RAG] erro busca global:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[RAG] exception buscarChunksRelevantes:', err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// CACHE SEMÂNTICO — threshold alto (0.95)
// Hits são incrementados via RPC (rastrear utilidade)
// ═══════════════════════════════════════════════════════════════

function hashMensagem(msg) {
  return createHash('sha256').update(msg.trim().toLowerCase()).digest('hex');
}

export async function buscarCache(mensagem, threshold = 0.95) {
  try {
    const embedding = await gerarEmbedding(mensagem);

    const { data, error } = await supabase.rpc('match_semantic_cache', {
      query_embedding: embedding,
      match_threshold: threshold
    });

    if (error) {
      console.error('[CACHE] erro busca:', error.message);
      return null;
    }

    if (!data || data.length === 0) return null;

    const hit = data[0];
    // incrementa contador de hits (fire-and-forget)
    supabase.rpc('increment_cache_hit', { cache_id: hit.id }).then(({ error: e }) => {
      if (e) console.error('[CACHE] erro incrementar hit:', e.message);
    });

    return { resposta: hit.resposta, similarity: hit.similarity };
  } catch (err) {
    console.error('[CACHE] exception buscarCache:', err);
    return null;
  }
}

export async function salvarCache(mensagem, resposta) {
  try {
    const embedding = await gerarEmbedding(mensagem);

    const { error } = await supabase.from('semantic_cache').insert({
      query_hash: hashMensagem(mensagem),
      query_texto: mensagem,
      query_embedding: embedding,
      resposta
    });

    if (error) {
      console.error('[CACHE] erro salvar:', error.message);
    }
  } catch (err) {
    console.error('[CACHE] exception salvarCache:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER: monta bloco de contexto pra injetar no system prompt
// ═══════════════════════════════════════════════════════════════

export function montarContextoChunks(chunks) {
  if (!chunks || chunks.length === 0) return '';

  const blocos = chunks.map(c =>
    `[${c.categoria.toUpperCase()} — ${c.titulo}]\n${c.conteudo}`
  );

  return [
    '═══════════════════════════════════════════════════════════════',
    'CONTEXTO TÉCNICO RELEVANTE (consulte conforme necessário):',
    '═══════════════════════════════════════════════════════════════',
    '',
    blocos.join('\n\n---\n\n'),
    '',
    '═══════════════════════════════════════════════════════════════'
  ].join('\n');
}
