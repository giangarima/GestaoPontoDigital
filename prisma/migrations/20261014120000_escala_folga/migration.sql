-- Escala de folga: ciclo de trabalho/folga por colaborador (versionado por
-- vigência) e ajustes pontuais por dia.

-- CreateTable
CREATE TABLE "escala_ciclos" (
    "id" TEXT NOT NULL,
    "colaborador_id" TEXT NOT NULL,
    "vigencia_inicio" DATE NOT NULL,
    "sequencia" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escala_ciclos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "escala_ciclos_sequencia_check" CHECK ("sequencia" IS NULL OR "sequencia" ~ '^[TF]{2,28}$')
);

-- CreateTable
CREATE TABLE "escala_ajustes" (
    "colaborador_id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "trabalha" BOOLEAN NOT NULL,
    "motivo" TEXT,
    "criado_por" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escala_ajustes_pkey" PRIMARY KEY ("colaborador_id","data")
);

-- CreateIndex
CREATE UNIQUE INDEX "escala_ciclos_colaborador_id_vigencia_inicio_key" ON "escala_ciclos"("colaborador_id", "vigencia_inicio");

-- AddForeignKey
ALTER TABLE "escala_ciclos" ADD CONSTRAINT "escala_ciclos_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaboradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escala_ajustes" ADD CONSTRAINT "escala_ajustes_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaboradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escala_ajustes" ADD CONSTRAINT "escala_ajustes_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
