/**
 * @module services/justificativa.service
 * @description Gestão de justificativas de falta (admin).
 */

import { get, post, del } from './api';

export interface Justificativa {
	id: string;
	colaboradorId: string;
	colaboradorNome: string;
	data: string;
	/** Último dia (data pura, meia-noite UTC). Igual a `data` em justificativa de um dia. */
	dataFim: string;
	motivo: string;
	anexoUrl: string | null;
	status: 'pending' | 'approved' | 'rejected';
	approvedBy?: string;
	approvedAt?: string;
}

export interface JustificativaInput {
	colaboradorId: string;
	data: string;
	motivo: string;
	anexoUrl?: string;
}

export const justificativaService = {
	list: () => get<Justificativa[]>('/justificativas'),
	create: (data: JustificativaInput) => post<Justificativa>('/justificativas', data),
	remove: (id: string) => del<void>(`/justificativas/${id}`),
	approve: (id: string) => post<Justificativa>(`/justificativas/${id}/approve`, {}),
	reject: (id: string) => post<Justificativa>(`/justificativas/${id}/reject`, {}),

	listMy: () => get<Justificativa[]>('/justificativas/me'),
	createMy: (data: Omit<JustificativaInput, 'colaboradorId'>) =>
		post<Justificativa>('/justificativas/me', data),
	removeMy: (id: string) => del<void>(`/justificativas/me/${id}`)
};
