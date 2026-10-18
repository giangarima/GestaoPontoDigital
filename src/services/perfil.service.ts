/**
 * @module services/perfil.service
 * @description Perfil do colaborador (dashboard individual do admin): o dia, a
 * semana e os cards do período. Espelha os tipos de `src/lib/server/perfil/`.
 */

import { get } from './api';

export type PeriodoPerfil = '30d' | '3m' | '6m' | '12m';

export type SituacaoDia =
	| 'normal'
	| 'aberto'
	| 'em_andamento'
	| 'falta'
	| 'ausencia'
	| 'feriado'
	| 'sem_expediente'
	| 'fora_vinculo';

export interface DesviosDia {
	entradaMin: number | null;
	voltaMin: number | null;
	saidaMin: number | null;
	intervaloMin: number | null;
	intervaloPrevistoMin: number | null;
	atrasoEntrada: boolean;
	voltaAtrasada: boolean;
	intervaloCurto: boolean;
}

export interface DiaDetalhe {
	dia: string;
	situacao: SituacaoDia;
	ausenciaTipo: string | null;
	feriado: string | null;
	/** "HH:MM". */
	previstas: string[];
	marcacoes: { hora: string; incluida: boolean }[];
	desvios: DesviosDia;
	ajuste: boolean;
	realizadoMin: number;
	contratualMin: number | null;
	totalMin: number | null;
}

export type Tom = 'ok' | 'aviso' | 'alerta' | 'neutro';

export interface SemanaPerfil {
	inicio: string;
	fim: string;
	dias: DiaDetalhe[];
	realizadoMin: number;
	previstoMin: number;
	diasForaDaConta: number;
	atrasosEntrada: number;
	voltasAtrasadas: number;
	faltas: number;
}

export interface CardsPerfil {
	presenca: {
		diasComMarcacao: number;
		diasPrevistos: number;
		faltas: number;
		percentual: number | null;
		ferias: number;
		atestado: number;
		outrasAusencias: number;
		folgas: number;
	};
	pontualidade: { diasAvaliados: number; diasSemAtraso: number; percentual: number | null };
	ondeAtrasa: {
		onde: 'entrada' | 'volta' | 'ambos' | 'nenhum';
		entradas: number;
		voltas: number;
		tipicoEntradaMin: number | null;
		tipicoVoltaMin: number | null;
	};
	saldo: {
		realizadoMin: number;
		previstoMin: number;
		saldoMin: number;
		diasComAjuste: number;
		diasComBatidaFaltando: number;
	};
	padrao: { diasComAtraso: number; compensaNaSaida: boolean };
}

export interface PerfilColaborador {
	colaborador: {
		id: string;
		nome: string;
		cargo: string | null;
		departamento: string | null;
		jornada: string | null;
		admissao: string | null;
		desligamento: string | null;
	};
	semJornada: boolean;
	dia: {
		rotulo: 'hoje' | 'ultimo';
		dia: DiaDetalhe;
		chip: { texto: string; tom: Tom };
		leitura: string;
	} | null;
	semana: SemanaPerfil | null;
	periodo: PeriodoPerfil;
	intervalo: { inicio: string; fim: string };
	periodosDisponiveis: PeriodoPerfil[];
	cards: CardsPerfil;
}

export const perfilService = {
	get: (colaboradorId: string, periodo: PeriodoPerfil) =>
		get<PerfilColaborador>(`/admin/colaboradores/${colaboradorId}/perfil?periodo=${periodo}`)
};
