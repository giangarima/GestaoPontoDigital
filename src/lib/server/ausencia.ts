/**
 * @module lib/server/ausencia
 * @description Mapeamento Ausencia (Prisma) → DTOs de Férias e Justificativa.
 *
 * Férias e justificativas foram unificadas na tabela `ausencias` (discriminadas
 * por `tipo`). Os DTOs preservam o contrato antigo das APIs `/api/ferias` e
 * `/api/justificativas` (campos `observacao`/`data`, status em inglês) para não
 * quebrar o frontend.
 */

import type { Ausencia } from '@/lib/server/prisma-client/client';

/** Tudo que não é férias é tratado como justificativa. */
export const TIPO_JUSTIFICATIVA_PADRAO = 'atestado';

// Status: banco em PT; DTO em inglês (contrato do frontend/serviços).
const STATUS_TO_DTO: Record<string, string> = {
	pendente: 'pending',
	aprovada: 'approved',
	rejeitada: 'rejected'
};
export const STATUS_APROVADA = 'aprovada';
export const STATUS_REJEITADA = 'rejeitada';

export function statusToDto(status: string): string {
	return STATUS_TO_DTO[status] ?? status;
}

type ComColaboradorNome = Ausencia & { colaborador: { usuario: { nome: string } } };

export function toFeriasDTO(a: ComColaboradorNome) {
	return {
		id: a.id,
		colaboradorId: a.colaboradorId,
		colaboradorNome: a.colaborador.usuario.nome,
		dataInicio: a.dataInicio.toISOString(),
		dataFim: a.dataFim.toISOString(),
		observacao: a.motivo
	};
}

export function toJustificativaDTO(a: Ausencia, colaboradorNome: string) {
	return {
		id: a.id,
		colaboradorId: a.colaboradorId,
		colaboradorNome,
		// `data` é o início (contrato antigo). Lançamento manual tem dataInicio == dataFim,
		// mas atestado de vários dias (seed) não — `dataFim` permite filtrar
		// por período pela sobreposição.
		data: a.dataInicio.toISOString(),
		dataFim: a.dataFim.toISOString(),
		motivo: a.motivo,
		anexoUrl: a.anexoUrl,
		status: statusToDto(a.status),
		approvedBy: a.revisadoPor,
		approvedAt: a.revisadoEm?.toISOString()
	};
}
