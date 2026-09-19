/**
 * @module services/auditoria.service
 * @description Auditoria de integridade do diário de marcações (Portaria 671/2021):
 * hash-chain das batidas + sequência de NSR. Somente admin.
 */

import { get } from './api';

/** Batida vista como elo da cadeia (NSR e hashes). */
export interface Elo {
	nsr: string;
	colaborador: string;
	tipo: string;
	marcadoEm: string;
	registradoEm: string;
	hash: string;
	hashAnterior: string | null;
}

export interface Auditoria {
	/** true só se a cadeia confere E não há NSR faltando. */
	integra: boolean;
	verificadoEm: string;
	cadeia: {
		total: number;
		valida: boolean;
		quebraNsr: string | null;
		motivo: string | null;
	};
	/** Batida onde a cadeia quebrou (null se íntegra). */
	quebra: Elo | null;
	sequencia: {
		ultimoNsr: string;
		totalAusentes: number;
		ausentes: string[];
	};
	/** Últimas batidas, da mais recente para a mais antiga. */
	elos: Elo[];
}

/** Diferença entre o relógio do servidor (REP-P) e a Hora Legal Brasileira (NTP.br). */
export interface HoraLegal {
	consultadoEm: string;
	/** null quando nenhum servidor NTP respondeu. */
	medicao: {
		servidor: string;
		/** Hora legal − relógio do servidor (ms). Positivo = servidor atrasado. */
		offsetMs: number;
		atrasoMs: number;
		estrato: number;
	} | null;
	falhas: { servidor: string; erro: string }[];
}

export const auditoriaService = {
	verificar: () => get<Auditoria>('/timesheet/auditoria'),
	horaLegal: () => get<HoraLegal>('/admin/hora-legal')
};
