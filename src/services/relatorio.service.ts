/**
 * @module services/relatorio.service
 * @description Relatórios: espelho individual e consolidado mensal.
 */

import { get } from './api';
import type { DailySummary } from './timesheet.service';

/** Totais de horas de uma jornada (efetiva ou original). */
export interface EspelhoTotais {
	horas: number;
	extras: number;
	deficit: number;
}

/** Dia do espelho: estado efetivo (com ajustes) + totais da jornada original (só marcações do colaborador). */
export type EspelhoDia = DailySummary & {
	original: { totalHours: number; overtime: number; deficit: number };
};

export interface EspelhoRelatorio {
	colaborador: { id: string; nome: string };
	inicio: string;
	fim: string;
	dias: EspelhoDia[];
	totais: EspelhoTotais & { original: EspelhoTotais };
}

export interface ConsolidadoLinha {
	colaboradorId: string;
	colaboradorNome: string;
	diasTrabalhados: number;
	diasPrevistos: number;
	horas: number;
	horasPrevistas: number;
	faltas: number;
	diasEmAberto: number;
	/** Banco de horas do mês (extras − déficit), em horas, com sinal. */
	saldo: number;
	extras: number;
	deficit: number;
	periodosFerias: number;
	faltasJustificadas: number;
}

export interface ConsolidadoRelatorio {
	mes: string;
	linhas: ConsolidadoLinha[];
}

export const relatorioService = {
	espelho: (params: { colaboradorId: string; inicio: string; fim: string }) =>
		get<EspelhoRelatorio>(
			`/relatorios/espelho?colaboradorId=${params.colaboradorId}&inicio=${params.inicio}&fim=${params.fim}`
		),
	consolidado: (mes: string) => get<ConsolidadoRelatorio>(`/relatorios/consolidado?mes=${mes}`)
};
