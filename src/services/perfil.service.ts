/**
 * @module services/perfil.service
 * @description Perfil do colaborador ao longo do tempo (dashboard individual do admin).
 */

import { get } from './api';

export type PeriodoPerfil = '30d' | '3m' | '6m' | '12m';
export type Granularidade = 'semana' | 'mes';

export type SituacaoDiaPerfil =
	| 'no_horario'
	| 'atraso'
	| 'falta'
	| 'aberto'
	| 'ausencia'
	| 'folga'
	| 'sem_jornada'
	| 'fora_vinculo';

export type FaixaChegada = 'antes' | 'pontual' | 'ate15' | 'ate30' | 'acima30';

export interface ResumoPerfil {
	pontualidade: {
		diasAvaliados: number;
		diasComAtraso: number;
		percentualNoHorario: number | null;
		atrasoMedioMin: number | null;
		maiorAtrasoMin: number | null;
		atrasoTotalMin: number;
	};
	assiduidade: {
		diasPrevistos: number;
		faltas: number;
		diasEmAberto: number;
		diasAtestado: number;
		diasFerias: number;
		diasOutrasAusencias: number;
		inclusoes: number;
		desconsideradas: number;
	};
	horas: {
		realizadoMin: number;
		previstoMin: number;
		extraMin: number;
		deficitMin: number;
		saidasAntecipadas: number;
		saidaAntecipadaMediaMin: number | null;
		intervalosCurtos: number;
		intervalosLongos: number;
	};
	local: { batidas: number; conferidas: number; fora: number; semLocalizacao: number };
}

export interface PontoSerie {
	chave: string;
	diasAvaliados: number;
	diasComAtraso: number;
	percentualAtraso: number | null;
	atrasoMedioMin: number | null;
	faltas: number;
}

export interface PontoDiaSemana {
	diaSemana: number;
	diasAvaliados: number;
	diasComAtraso: number;
	percentualAtraso: number | null;
	atrasoMedioMin: number | null;
}

export interface DiaPerfil {
	dia: string;
	situacao: SituacaoDiaPerfil;
	chegadaMin: number | null;
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
	periodo: PeriodoPerfil;
	granularidade: Granularidade;
	atual: { inicio: string; fim: string };
	anterior: { inicio: string; fim: string };
	perfil: {
		semJornada: boolean;
		resumo: ResumoPerfil;
		serie: PontoSerie[];
		porDiaSemana: PontoDiaSemana[];
		chegada: Record<FaixaChegada, number>;
		dias: DiaPerfil[];
	};
	resumoAnterior: ResumoPerfil;
	banco: { inicio: string; fim: string; saldoMin: number } | null;
}

export const perfilService = {
	get: (colaboradorId: string, periodo: PeriodoPerfil) =>
		get<PerfilColaborador>(`/admin/colaboradores/${colaboradorId}/perfil?periodo=${periodo}`)
};
