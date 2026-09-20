/**
 * @module services/admin.service
 * @description Operações exclusivas do administrador (métricas agregadas).
 */

import { get } from './api';

export type EntradaStatus = 'pontual' | 'atrasado' | 'falta' | 'pendente' | 'folga' | 'sem_jornada';

export interface EntradaDia {
	colaboradorId: string;
	nome: string;
	jornadaEntrada: string | null;
	batidaEntrada: string | null;
	atrasoMin: number;
	status: EntradaStatus;
}

export interface DashboardMetrics {
	referenciaData: string;
	colaboradoresAtivos: number;
	totalColaboradores: number;
	totalColaboradoresRegistrados: number;
	pontosHoje: number;
	atrasosHoje: number;
	faltasHoje: number;
	justificativasMes: number;
	feriasAtivasNoMes: number;
	horasExtrasMes: number;
	horasDeficitMes: number;
	horasExtrasPorDia: { date: string; horas: number }[];
	topExtras: { colaboradorId: string; nome: string; horas: number }[];
	entradasHoje: EntradaDia[];
}

export interface MarcacaoPendente {
	hora: string;
	fonte: 'O' | 'I';
}

export interface DiaPendente {
	dia: string;
	semana: string;
	marcacoes: MarcacaoPendente[];
	realizadoMin: number;
}

export interface PendenciaColaborador {
	colaboradorId: string;
	nome: string;
	cargo: string | null;
	dias: DiaPendente[];
}

export interface Pendencias {
	inicio: string;
	fim: string;
	total: number;
	colaboradores: PendenciaColaborador[];
}

export const adminService = {
	dashboard: (data?: string) =>
		get<DashboardMetrics>(`/admin/dashboard${data ? `?data=${data}` : ''}`),

	/** Dias em aberto (marcação ímpar) do mês, por colaborador. */
	pendencias: (mes?: string) => get<Pendencias>(`/admin/pendencias${mes ? `?mes=${mes}` : ''}`)
};
