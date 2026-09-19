-- Eventos sensíveis do REP (AFD tipo 6, Portaria 671/2021): disponibilidade ("07")
-- e indisponibilidade ("08") de serviço do REP-P. NSR na mesma sequência das batidas.
CREATE TABLE "eventos_sensiveis" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "nsr" BIGINT NOT NULL,
    "registrado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo_evento" TEXT NOT NULL,

    CONSTRAINT "eventos_sensiveis_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eventos_sensiveis_tipo_evento_check" CHECK ("tipo_evento" IN ('02', '07', '08'))
);

CREATE UNIQUE INDEX "eventos_sensiveis_empresa_id_nsr_key" ON "eventos_sensiveis"("empresa_id", "nsr");
CREATE INDEX "eventos_sensiveis_empresa_id_nsr_idx" ON "eventos_sensiveis"("empresa_id", "nsr");

ALTER TABLE "eventos_sensiveis" ADD CONSTRAINT "eventos_sensiveis_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
