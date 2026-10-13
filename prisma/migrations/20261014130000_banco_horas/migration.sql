-- Banco de horas: regime, início dos ciclos e o destino do saldo negativo no
-- vencimento, por empresa (art. 59 da CLT).

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN "banco_horas_regime" TEXT NOT NULL DEFAULT 'nenhum',
ADD COLUMN "banco_horas_inicio" DATE,
ADD COLUMN "banco_horas_negativo" TEXT NOT NULL DEFAULT 'zerar',
ADD CONSTRAINT "empresas_banco_horas_regime_check" CHECK ("banco_horas_regime" IN ('nenhum', 'mensal', 'semestral', 'anual')),
ADD CONSTRAINT "empresas_banco_horas_negativo_check" CHECK ("banco_horas_negativo" IN ('zerar', 'descontar'));
