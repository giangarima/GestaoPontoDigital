-- AlterTable: Empresa — dados cadastrais do AFD + contador de NSR
ALTER TABLE "empresas" ADD COLUMN     "razao_social" TEXT,
ADD COLUMN     "caepf_cno" TEXT,
ADD COLUMN     "local_prestacao" TEXT,
ADD COLUMN     "ultimo_nsr" BIGINT NOT NULL DEFAULT 0;

-- AlterTable: Registro — CPF snapshot + data-hora de gravação (AFD tipo 7)
-- cpf entra com DEFAULT '' temporário para linhas existentes e já perde o default
-- (o reseed subsequente recria todas as batidas com o CPF real).
ALTER TABLE "registros" ADD COLUMN     "cpf" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "registrado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "registros" ALTER COLUMN "cpf" DROP DEFAULT;

-- CreateTable: eventos_empregador (AFD tipo 2)
CREATE TABLE "eventos_empregador" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "nsr" BIGINT NOT NULL,
    "registrado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cpf_responsavel" TEXT NOT NULL,
    "inscricao_tipo" TEXT NOT NULL,
    "inscricao" TEXT NOT NULL,
    "caepf_cno" TEXT,
    "razao_social" TEXT NOT NULL,
    "local_prestacao" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_empregador_pkey" PRIMARY KEY ("id")
);

-- CreateTable: eventos_empregado (AFD tipo 5)
CREATE TABLE "eventos_empregado" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "nsr" BIGINT NOT NULL,
    "registrado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operacao" TEXT NOT NULL,
    "cpf_empregado" TEXT NOT NULL,
    "nome_empregado" TEXT NOT NULL,
    "cpf_responsavel" TEXT NOT NULL,
    "colaborador_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_empregado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "eventos_empregador_empresa_id_nsr_key" ON "eventos_empregador"("empresa_id", "nsr");
CREATE INDEX "eventos_empregador_empresa_id_nsr_idx" ON "eventos_empregador"("empresa_id", "nsr");
CREATE UNIQUE INDEX "eventos_empregado_empresa_id_nsr_key" ON "eventos_empregado"("empresa_id", "nsr");
CREATE INDEX "eventos_empregado_empresa_id_nsr_idx" ON "eventos_empregado"("empresa_id", "nsr");

-- AddForeignKey
ALTER TABLE "eventos_empregador" ADD CONSTRAINT "eventos_empregador_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "eventos_empregado" ADD CONSTRAINT "eventos_empregado_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
