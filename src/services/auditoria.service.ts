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

export const auditoriaService = {
	verificar: () => get<Auditoria>('/timesheet/auditoria')
};
