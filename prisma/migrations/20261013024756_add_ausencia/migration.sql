-- DropForeignKey
ALTER TABLE "comprovantes" DROP CONSTRAINT "comprovantes_registro_fkey";

-- DropIndex
DROP INDEX "registros_empresa_nsr_idx";

-- AddForeignKey
ALTER TABLE "empresa_nsr_sequencias" ADD CONSTRAINT "empresa_nsr_sequencias_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprovantes" ADD CONSTRAINT "comprovantes_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "registros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprovantes" ADD CONSTRAINT "comprovantes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "comprovantes_colaborador_gerado_idx" RENAME TO "comprovantes_colaborador_id_gerado_em_idx";

-- RenameIndex
ALTER INDEX "comprovantes_empresa_gerado_idx" RENAME TO "comprovantes_empresa_id_gerado_em_idx";
