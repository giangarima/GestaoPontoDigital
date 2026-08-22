-- AlterTable
ALTER TABLE "registros" ADD COLUMN     "nsr" BIGINT NOT NULL,
ADD COLUMN     "hash" TEXT NOT NULL,
ADD COLUMN     "hash_anterior" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "registros_empresa_id_nsr_key" ON "registros"("empresa_id", "nsr");
