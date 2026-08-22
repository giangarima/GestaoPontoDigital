/**
 * @module services/empresa.service
 * @description Gerenciamento de empresas (multi-tenant).
 */

import { get, post, put } from './api';

export interface Empresa {
	id: string;
	nome: string;
	cnpj: string | null;
	razaoSocial: string | null;
	caepfCno: string | null;
	localPrestacao: string | null;
	horaAbertura: string;
	horaFechamento: string;
	createdAt: string;
	updatedAt: string;
}

export interface EmpresaInput {
	nome: string;
	cnpj?: string;
	razaoSocial?: string;
	caepfCno?: string;
	localPrestacao?: string;
	horaAbertura: string;
	horaFechamento: string;
}

export const empresaService = {
	list: () => get<Empresa[]>('/empresas'),
	get: (id: string) => get<Empresa>(`/empresas/${id}`),
	create: (data: EmpresaInput) => post<Empresa>('/empresas', data),
	update: (id: string, data: Partial<EmpresaInput>) => put<Empresa>(`/empresas/${id}`, data)
};
