/**
 * @module services/local-trabalho.service
 * @description Locais de trabalho da empresa (conferência da geolocalização da batida).
 */

import { get, post, put, del } from './api';

export interface LocalTrabalho {
	id: string;
	nome: string;
	latitude: number;
	longitude: number;
	raioM: number;
	ativo: boolean;
}

export type LocalTrabalhoInput = Omit<LocalTrabalho, 'id'>;

export const localTrabalhoService = {
	list: () => get<LocalTrabalho[]>('/locais-trabalho'),
	create: (data: LocalTrabalhoInput) => post<LocalTrabalho>('/locais-trabalho', data),
	update: (id: string, data: LocalTrabalhoInput) =>
		put<LocalTrabalho>(`/locais-trabalho/${id}`, data),
	/** Sem batidas vinculadas apaga (devolve `undefined`); com batidas, desativa. */
	remove: (id: string) => del<LocalTrabalho | undefined>(`/locais-trabalho/${id}`)
};
