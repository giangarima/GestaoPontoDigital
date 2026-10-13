/**
 * @module services/banco-horas.service
 * @description Banco de horas: saldo por ciclo, extrato diário e folga compensatória.
 */

import { del, get, post } from './api';
import type { RegimeBanco } from './empresa.service';

export type ResultadoCiclo = 'pagar' | 'zerado' | 'descontar' | 'quitado';

export interface Periodo {
	inicio: string;
	fim: string;
}

export interface ResumoCiclo extends Periodo {
	creditoMin: number;
	debitoMin: number;
	folgaMin: number;
	saldoMin: number;
	encerrado: boolean;
	resultado: ResultadoCiclo | null;
	resultadoMin: number;
}

export interface MovimentoBanco {
	dia: string;
	creditoMin: number;
	debitoMin: number;
	folgaMin: number;
	ocorrencia: string;
}

export interface ConfigBanco {
	regime: Exclude<RegimeBanco, 'nenhum'>;
	inicio: string;
	negativo: 'zerar' | 'descontar';
}

export interface LinhaBanco {
	colaboradorId: string;
	nome: string;
	cargo: string | null;
	departamento: string | null;
	atual: ResumoCiclo;
	anterior: ResumoCiclo | null;
}

export type BancoEmpresa =
	| { regime: 'nenhum' }
	| {
			regime: ConfigBanco['regime'];
			config: ConfigBanco;
			atual: Periodo | null;
			anterior: Periodo | null;
			linhas: LinhaBanco[];
	  };

export interface FolgaLancada {
	id: string;
	dataInicio: string;
	dataFim: string;
	motivo: string | null;
}

export type ExtratoBanco =
	| { regime: 'nenhum' }
	| {
			regime: ConfigBanco['regime'];
			config: ConfigBanco;
			colaborador: { id: string; nome: string };
			ciclos: Periodo[];
			ciclo: (ResumoCiclo & { movimentos: MovimentoBanco[] }) | null;
			folgas: FolgaLancada[];
	  };

export const ROTULO_REGIME: Record<RegimeBanco, string> = {
	nenhum: 'Sem banco de horas',
	mensal: 'Mensal',
	semestral: 'Semestral (acordo individual)',
	anual: 'Anual (convenção coletiva)'
};

export const ROTULO_RESULTADO: Record<ResultadoCiclo, string> = {
	pagar: 'A pagar como extra',
	zerado: 'Saldo negativo zerado',
	descontar: 'A descontar',
	quitado: 'Quitado'
};

export const bancoHorasService = {
	empresa: () => get<BancoEmpresa>('/admin/banco-horas'),
	extrato: (colaboradorId: string, ciclo?: string) =>
		get<ExtratoBanco>(`/admin/banco-horas/${colaboradorId}${ciclo ? `?ciclo=${ciclo}` : ''}`),
	meu: () => get<ExtratoBanco>('/timesheet/banco-horas'),
	lancarFolga: (
		colaboradorId: string,
		dados: { dataInicio: string; dataFim: string; motivo?: string }
	) => post<FolgaLancada>(`/admin/banco-horas/${colaboradorId}/folgas`, dados),
	cancelarFolga: (colaboradorId: string, id: string) =>
		del<void>(`/admin/banco-horas/${colaboradorId}/folgas/${id}`)
};
