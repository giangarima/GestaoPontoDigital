-- Feriados e pontos facultativos da empresa (os nacionais são calculados e só
-- ganham linha quando a empresa abre no dia) e a escala de quem trabalha neles.

-- CreateTable
CREATE TABLE "feriados" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "data" TIMESTAMPTZ(6) NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'feriado',
    "abrangencia" TEXT NOT NULL DEFAULT 'municipal',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feriados_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "feriados_tipo_check" CHECK ("tipo" IN ('feriado', 'ponto_facultativo')),
    CONSTRAINT "feriados_abrangencia_check" CHECK ("abrangencia" IN ('nacional', 'estadual', 'municipal'))
);

-- CreateTable
CREATE TABLE "feriado_escalas" (
    "feriado_id" TEXT NOT NULL,
    "colaborador_id" TEXT NOT NULL,

    CONSTRAINT "feriado_escalas_pkey" PRIMARY KEY ("feriado_id","colaborador_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feriados_empresa_id_data_key" ON "feriados"("empresa_id", "data");

-- CreateIndex
CREATE INDEX "feriado_escalas_colaborador_id_idx" ON "feriado_escalas"("colaborador_id");

-- AddForeignKey
ALTER TABLE "feriados" ADD CONSTRAINT "feriados_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feriado_escalas" ADD CONSTRAINT "feriado_escalas_feriado_id_fkey" FOREIGN KEY ("feriado_id") REFERENCES "feriados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feriado_escalas" ADD CONSTRAINT "feriado_escalas_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaboradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
