-- AlterTable
-- `nsr` pode já existir: a migration 20260820_add_comprovante_nsr (que ordena antes
-- desta) também cria a coluna, com backfill. IF NOT EXISTS evita a colisão.
ALTER TABLE "registros" ADD COLUMN IF NOT EXISTS "nsr" BIGINT NOT NULL,
ADD COLUMN     "hash" TEXT NOT NULL,
ADD COLUMN     "hash_anterior" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "registros_empresa_id_nsr_key" ON "registros"("empresa_id", "nsr");
