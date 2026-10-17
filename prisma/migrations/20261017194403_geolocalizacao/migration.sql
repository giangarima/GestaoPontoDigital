-- AlterTable
ALTER TABLE "registros" ADD COLUMN     "distancia_m" INTEGER,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "local_trabalho_id" TEXT,
ADD COLUMN     "localizacao" TEXT,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "precisao_m" INTEGER;

-- CreateTable
CREATE TABLE "locais_trabalho" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "raio_m" INTEGER NOT NULL DEFAULT 150,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "locais_trabalho_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "locais_trabalho_empresa_id_idx" ON "locais_trabalho"("empresa_id");

-- AddForeignKey
ALTER TABLE "registros" ADD CONSTRAINT "registros_local_trabalho_id_fkey" FOREIGN KEY ("local_trabalho_id") REFERENCES "locais_trabalho"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locais_trabalho" ADD CONSTRAINT "locais_trabalho_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
