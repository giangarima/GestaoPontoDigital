/**
 * @module services/timesheet.service
 * @description Operações de registro e consulta de ponto.
 */

import { post, get, baixar } from './api';

export type RegistroType = 'entrada' | 'saida_almoco' | 'retorno_almoco' | 'saida';

export interface RegistroAnulacao {
	motivo: string;
	anuladoPor: string;
	anuladoEm: string;
	/** Batida corrigida que substituiu esta (ajuste). Nulo em anulação avulsa. */
	registroSubstitutoId: string | null;
}

export interface RegistroRecord {
	id: string;
	colaboradorId: string;
	type: RegistroType;
	timestamp: string;
	method: 'manual';
	createdBy: string | null;
	createdReason: string | null;
	anulacao: RegistroAnulacao | null;
}

export interface DailySummary {
	date: string;
	registros: RegistroRecord[];
	totalHours: number;
	overtime: number;
	deficit: number;
}

/** Comprovante de uma marcação original das últimas 48h (Portaria 671/2021, art. 80). */
export interface ComprovanteItem {
	registroId: string;
	tipo: RegistroType;
	nsr: string;
	marcadoEm: string;
	/** Envio por e-mail: 'pendente' | 'enviado' | 'falha' | null (ainda não gerado). */
	envioStatus: string | null;
	enviadoEm: string | null;
}

export const timesheetService = {
	registrar: (data: { type: RegistroType; method: RegistroRecord['method'] }) =>
		post<RegistroRecord>('/timesheet/registro', data),

	today: () => get<DailySummary>('/timesheet/today'),

	history: (params: { startDate: string; endDate: string }) =>
		get<DailySummary[]>(
			`/timesheet/history?startDate=${params.startDate}&endDate=${params.endDate}`
		),

	/** Comprovantes das marcações das últimas 48h do próprio colaborador. */
	comprovantes: () => get<ComprovanteItem[]>('/timesheet/comprovantes'),

	/** Baixa o PDF assinado do comprovante de uma marcação. */
	baixarComprovante: (registroId: string) =>
		baixar(`/timesheet/comprovantes/${registroId}`, 'comprovante.pdf')
};
