-- Migration: add_comprovante_nsr
-- 1) Cria tabela de sequências por empresa
CREATE TABLE IF NOT EXISTS empresa_nsr_sequencias (
  empresa_id TEXT PRIMARY KEY,
  proximo_nsr BIGINT NOT NULL DEFAULT 1
);

-- 2) Adiciona coluna nsr em registros (nullable para permitir backfill)
ALTER TABLE IF EXISTS registros
  ADD COLUMN IF NOT EXISTS nsr BIGINT;

-- 3) Cria tabela de comprovantes
CREATE TABLE IF NOT EXISTS comprovantes (
  id TEXT PRIMARY KEY,
  registro_id TEXT UNIQUE NOT NULL,
  empresa_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  nsr BIGINT NOT NULL,
  caminho_arquivo TEXT NOT NULL,
  hash_sha256 TEXT NOT NULL,
  gerado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_em TIMESTAMPTZ,
  envio_status TEXT NOT NULL DEFAULT 'pendente',
  envio_erro TEXT
);

ALTER TABLE IF EXISTS comprovantes
  ADD CONSTRAINT comprovantes_registro_fkey FOREIGN KEY (registro_id) REFERENCES registros(id) ON DELETE RESTRICT;

-- 4) Backfill: preencher nsr para registros existentes, por empresa, ordenado por marcado_em
WITH numerados AS (
  SELECT id, empresa_id,
    ROW_NUMBER() OVER (PARTITION BY empresa_id ORDER BY marcado_em ASC, id ASC) AS nsr_calc
  FROM registros
  WHERE nsr IS NULL
)
UPDATE registros r
SET nsr = n.nsr_calc
FROM numerados n
WHERE r.id = n.id;

-- 5) Inicializa contadores em empresa_nsr_sequencias (próximo = max(nsr)+1)
INSERT INTO empresa_nsr_sequencias (empresa_id, proximo_nsr)
SELECT empresa_id, COALESCE(MAX(nsr), 0) + 1
FROM registros
GROUP BY empresa_id
ON CONFLICT (empresa_id) DO UPDATE SET proximo_nsr = EXCLUDED.proximo_nsr;

-- 6) Coloca nsr como NOT NULL e adiciona restrições/indexes
ALTER TABLE registros ALTER COLUMN nsr SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS registros_empresa_nsr_unique ON registros (empresa_id, nsr);
CREATE INDEX IF NOT EXISTS registros_empresa_nsr_idx ON registros (empresa_id, nsr);

-- 7) Indexes para comprovantes
CREATE INDEX IF NOT EXISTS comprovantes_empresa_gerado_idx ON comprovantes (empresa_id, gerado_em);
CREATE INDEX IF NOT EXISTS comprovantes_colaborador_gerado_idx ON comprovantes (colaborador_id, gerado_em);
CREATE INDEX IF NOT EXISTS comprovantes_envio_status_idx ON comprovantes (envio_status);

-- Migration end
