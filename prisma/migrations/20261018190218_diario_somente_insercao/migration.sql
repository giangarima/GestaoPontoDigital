-- Diário do REP somente inserção (Portaria 671/2021, Anexo IX, item 7: os dados
-- da ARP não podem ser apagados nem alterados). Até aqui a integridade era só
-- DETECTADA (hash-chain + sequência de NSR, ver src/lib/server/auditoria.ts); os
-- triggers abaixo passam a IMPEDIR UPDATE/DELETE/TRUNCATE nas tabelas do diário.
--
-- Também nesta migration:
--  - sai `empresa_nsr_sequencias`, contador legado que nenhum código usava (o NSR
--    vem de `empresas.ultimo_nsr`, em registro-ledger.ts);
--  - a FK registros → locais_trabalho vira RESTRICT (o SET NULL era um UPDATE na
--    batida; local com batidas já era só desativado pela API);
--  - nasce `registro_anulacoes_revertidas`, para reverter anulação sem perder o
--    histórico do tratamento.
--
-- Limite: o dono da tabela pode `ALTER TABLE ... DISABLE TRIGGER`. É o que o seed
-- faz para recomeçar o banco de desenvolvimento. Contra quem tem a credencial do
-- dono, a defesa continua sendo a auditoria, que acusa a adulteração.
-- DropForeignKey
ALTER TABLE "empresa_nsr_sequencias" DROP CONSTRAINT "empresa_nsr_sequencias_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "registros" DROP CONSTRAINT "registros_local_trabalho_id_fkey";

-- DropTable
DROP TABLE "empresa_nsr_sequencias";

-- CreateTable
CREATE TABLE "registro_anulacoes_revertidas" (
    "id" TEXT NOT NULL,
    "anulacao_id" TEXT NOT NULL,
    "registro_id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "anulado_por" TEXT NOT NULL,
    "anulado_em" TIMESTAMPTZ(6) NOT NULL,
    "revertido_por" TEXT NOT NULL,
    "revertido_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_anulacoes_revertidas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registro_anulacoes_revertidas_anulacao_id_key" ON "registro_anulacoes_revertidas"("anulacao_id");

-- CreateIndex
CREATE INDEX "registro_anulacoes_revertidas_registro_id_idx" ON "registro_anulacoes_revertidas"("registro_id");

-- CreateIndex
CREATE INDEX "registro_anulacoes_revertidas_empresa_id_idx" ON "registro_anulacoes_revertidas"("empresa_id");

-- AddForeignKey
ALTER TABLE "registros" ADD CONSTRAINT "registros_local_trabalho_id_fkey" FOREIGN KEY ("local_trabalho_id") REFERENCES "locais_trabalho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_anulacoes_revertidas" ADD CONSTRAINT "registro_anulacoes_revertidas_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "registros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_anulacoes_revertidas" ADD CONSTRAINT "registro_anulacoes_revertidas_revertido_por_fkey" FOREIGN KEY ("revertido_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Diário somente inserção ─────────────────────────────────────────────────

CREATE FUNCTION "diario_somente_insercao"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Reverter anulação avulsa: a linha só sai depois de copiada para o histórico.
  IF TG_TABLE_NAME = 'registro_anulacoes' AND TG_OP = 'DELETE' AND EXISTS (
    SELECT 1 FROM "registro_anulacoes_revertidas" WHERE "anulacao_id" = OLD."id"
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% em "%" não é permitido: o diário do REP é somente inserção (Portaria 671/2021, Anexo IX, item 7)',
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "registros_somente_insercao"
  BEFORE UPDATE OR DELETE ON "registros"
  FOR EACH ROW EXECUTE FUNCTION "diario_somente_insercao"();
CREATE TRIGGER "registros_sem_truncate"
  BEFORE TRUNCATE ON "registros"
  FOR EACH STATEMENT EXECUTE FUNCTION "diario_somente_insercao"();

CREATE TRIGGER "eventos_empregador_somente_insercao"
  BEFORE UPDATE OR DELETE ON "eventos_empregador"
  FOR EACH ROW EXECUTE FUNCTION "diario_somente_insercao"();
CREATE TRIGGER "eventos_empregador_sem_truncate"
  BEFORE TRUNCATE ON "eventos_empregador"
  FOR EACH STATEMENT EXECUTE FUNCTION "diario_somente_insercao"();

CREATE TRIGGER "eventos_empregado_somente_insercao"
  BEFORE UPDATE OR DELETE ON "eventos_empregado"
  FOR EACH ROW EXECUTE FUNCTION "diario_somente_insercao"();
CREATE TRIGGER "eventos_empregado_sem_truncate"
  BEFORE TRUNCATE ON "eventos_empregado"
  FOR EACH STATEMENT EXECUTE FUNCTION "diario_somente_insercao"();

CREATE TRIGGER "eventos_sensiveis_somente_insercao"
  BEFORE UPDATE OR DELETE ON "eventos_sensiveis"
  FOR EACH ROW EXECUTE FUNCTION "diario_somente_insercao"();
CREATE TRIGGER "eventos_sensiveis_sem_truncate"
  BEFORE TRUNCATE ON "eventos_sensiveis"
  FOR EACH STATEMENT EXECUTE FUNCTION "diario_somente_insercao"();

CREATE TRIGGER "registro_anulacoes_somente_insercao"
  BEFORE UPDATE OR DELETE ON "registro_anulacoes"
  FOR EACH ROW EXECUTE FUNCTION "diario_somente_insercao"();
CREATE TRIGGER "registro_anulacoes_sem_truncate"
  BEFORE TRUNCATE ON "registro_anulacoes"
  FOR EACH STATEMENT EXECUTE FUNCTION "diario_somente_insercao"();

CREATE TRIGGER "registro_anulacoes_revertidas_somente_insercao"
  BEFORE UPDATE OR DELETE ON "registro_anulacoes_revertidas"
  FOR EACH ROW EXECUTE FUNCTION "diario_somente_insercao"();
CREATE TRIGGER "registro_anulacoes_revertidas_sem_truncate"
  BEFORE TRUNCATE ON "registro_anulacoes_revertidas"
  FOR EACH STATEMENT EXECUTE FUNCTION "diario_somente_insercao"();

-- Empresa: o cadastro segue editável e toda batida faz UPDATE em ultimo_nsr, então
-- UPDATE continua liberado. Bloqueia apagar (o cascade levaria o diário junto) e
-- fazer o contador de NSR andar para trás (reusaria NSRs).
CREATE FUNCTION "empresas_preserva_diario"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."ultimo_nsr" < OLD."ultimo_nsr" THEN
      RAISE EXCEPTION 'ultimo_nsr não pode diminuir (% → %): o NSR é sequencial e não se reusa',
        OLD."ultimo_nsr", NEW."ultimo_nsr"
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% em "empresas" não é permitido: apagaria o diário do REP (Portaria 671/2021, Anexo IX, item 7)',
    TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "empresas_preserva_diario"
  BEFORE UPDATE OR DELETE ON "empresas"
  FOR EACH ROW EXECUTE FUNCTION "empresas_preserva_diario"();
CREATE TRIGGER "empresas_sem_truncate"
  BEFORE TRUNCATE ON "empresas"
  FOR EACH STATEMENT EXECUTE FUNCTION "empresas_preserva_diario"();
