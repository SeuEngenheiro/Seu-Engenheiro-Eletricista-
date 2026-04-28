-- ═══════════════════════════════════════════════════════════════
-- Migration 001 — pgvector + RAG infrastructure
-- Run via Supabase Dashboard → SQL Editor
-- Idempotente: pode rodar múltiplas vezes sem quebrar
-- ═══════════════════════════════════════════════════════════════

-- 1) Habilita extensão pgvector (1-clique no Dashboard ou SQL aqui)
CREATE EXTENSION IF NOT EXISTS vector;

-- ═══════════════════════════════════════════════════════════════
-- 2) Tabela knowledge_chunks — base de conhecimento técnico
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id          BIGSERIAL PRIMARY KEY,
  categoria   TEXT NOT NULL,
  titulo      TEXT NOT NULL UNIQUE,
  conteudo    TEXT NOT NULL,
  embedding   VECTOR(1536) NOT NULL,
  tokens      INT,
  criado_em   TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_categoria
  ON knowledge_chunks (categoria);

-- ivfflat: bom equilíbrio busca/memória. lists=100 cobre até ~10k chunks
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
  ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ═══════════════════════════════════════════════════════════════
-- 3) Tabela semantic_cache — cache semântico de respostas
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS semantic_cache (
  id              BIGSERIAL PRIMARY KEY,
  query_hash      TEXT NOT NULL,
  query_texto     TEXT NOT NULL,
  query_embedding VECTOR(1536) NOT NULL,
  resposta        TEXT NOT NULL,
  hits            INT DEFAULT 0,
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  expira_em       TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_semantic_cache_expira
  ON semantic_cache (expira_em);

CREATE INDEX IF NOT EXISTS idx_semantic_cache_embedding
  ON semantic_cache USING ivfflat (query_embedding vector_cosine_ops) WITH (lists = 50);

-- ═══════════════════════════════════════════════════════════════
-- 4) RPC: busca top-K chunks relevantes por similaridade
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.75,
  match_count     INT DEFAULT 3,
  filter_categoria TEXT DEFAULT NULL
)
RETURNS TABLE (
  id         BIGINT,
  categoria  TEXT,
  titulo     TEXT,
  conteudo   TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.categoria,
    kc.titulo,
    kc.conteudo,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks kc
  WHERE
    (filter_categoria IS NULL OR kc.categoria = filter_categoria)
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 5) RPC: busca cache semântico (threshold alto = quase idêntico)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION match_semantic_cache(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.95
)
RETURNS TABLE (
  id         BIGINT,
  resposta   TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sc.id,
    sc.resposta,
    1 - (sc.query_embedding <=> query_embedding) AS similarity
  FROM semantic_cache sc
  WHERE
    sc.expira_em > NOW()
    AND 1 - (sc.query_embedding <=> query_embedding) > match_threshold
  ORDER BY sc.query_embedding <=> query_embedding
  LIMIT 1;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 6) RPC: incrementa hits do cache (rastrear utilidade)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION increment_cache_hit(cache_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE semantic_cache SET hits = hits + 1 WHERE id = cache_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 7) Limpeza automática de cache expirado (rodar via cron job)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION limpar_cache_expirado()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  removidos INT;
BEGIN
  DELETE FROM semantic_cache WHERE expira_em < NOW();
  GET DIAGNOSTICS removidos = ROW_COUNT;
  RETURN removidos;
END;
$$;
