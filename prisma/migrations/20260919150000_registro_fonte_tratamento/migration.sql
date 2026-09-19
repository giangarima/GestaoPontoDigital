-- Separa a marcação original do REP (fonte 'O') da inclusão manual do tratamento
-- (fonte 'I'). Portaria 671/2021: só o REP gera o AFD; inclusões/ajustes do
-- empregador são tratamento e vão só para o AEJ (fonteMarc "I" + motivo).
ALTER TABLE "registros" ADD COLUMN "fonte" TEXT NOT NULL DEFAULT 'O';
ALTER TABLE "registros" ALTER COLUMN "nsr" DROP NOT NULL;
ALTER TABLE "registros" ALTER COLUMN "hash" DROP NOT NULL;

-- Batidas criadas pelo admin (lançamento manual / ajuste) viram inclusões: saem
-- da sequência de NSR e da hash-chain. ATENÇÃO: em bancos que já tinham essas
-- linhas, a cadeia/sequência antiga fica com buracos — refaça o seed (db:reset).
UPDATE "registros" SET "fonte" = 'I', "nsr" = NULL, "hash" = NULL, "hash_anterior" = NULL
WHERE "criado_por" IS NOT NULL;

ALTER TABLE "registros" ADD CONSTRAINT "registros_fonte_check" CHECK (
  ("fonte" = 'O' AND "nsr" IS NOT NULL AND "hash" IS NOT NULL)
  OR ("fonte" = 'I' AND "nsr" IS NULL AND "hash" IS NULL AND "hash_anterior" IS NULL)
);
