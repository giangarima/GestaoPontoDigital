/**
 * @module services/admin.service
 * @description Operações exclusivas do administrador (métricas agregadas).
 */

import { get } from './api';

/**
 * Situação de presença no dia. `atrasado` NÃO entra aqui: é um booleano à parte
 * na linha, porque quem chegou tarde e continua na loja é as duas coisas.
 */
export type SituacaoDia =
	| 'trabalhando'
	| 'cumpriu'
	| 'ainda_nao_chegou'
	| 'falta_provavel'
	| 'folga'
	| 'ferias'
	| 'ausencia'
	| 'sem_jornada';

export type Turno = 'abertura' | 'fechamento' | 'integral' | 'intermediario' | 'meio_periodo';

export interface LinhaPainel {
	colaboradorId: string;
	nome: string;
	departamento: string | null;
	turno: Turno | null;

	previstaEntrada: string | null;
	previstaSaida: string | null;
	contratualMin: number | null;

	entradaHora: string | null;
	ultimaHora: string | null;
	marcacoes: number;
	sessaoAberta: boolean;
	emIntervalo: boolean;
	realizadoMin: number;

	diferencaMin: number | null;
	atrasado: boolean;
	diaEmAberto: boolean;
	ausencia: { tipo: string; rotulo: string } | null;
	situacao: SituacaoDia;
	divergencia: boolean;
	ordem: number;
}

export interface ResumoPainel {
	escalados: number;
	trabalhando: number;
	cumpriram: number;
	atrasados: number;
	faltasProvaveis: number;
	naoChegaram: number;
	ausentes: number;
	ferias: number;
	folgas: number;
	semJornada: number;
	diasEmAberto: number;
	marcacoesDoDia: number;
	colaboradoresAtivos: number;
}

export interface AtencaoPainel {
	atrasados: number;
	faltasProvaveis: number;
	diasEmAberto: number;
	justificativasPendentes: number;
}

export interface PainelDia {
	dia: string;
	ehHoje: boolean;
	ehFuturo: boolean;
	tolerancias: { atrasoMin: number; faltaMin: number };
	resumo: ResumoPainel;
	atencao: AtencaoPainel;
	linhas: LinhaPainel[];
	/** Ninguém tem expediente previsto no dia. */
	semEscala: boolean;
	/** Só quando `semEscala`: dias vizinhos com expediente. */
	navegacao: { anterior: string | null; proximo: string | null } | null;
}

/** Contadores dos badges do menu. */
export interface ResumoAdmin {
	diasEmAberto: number;
	justificativasPendentes: number;
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
	/**
	 * Painel de um dia. `signal` permite abortar a requisição anterior quando o
	 * admin troca de dia ou quando a atualização automática dispara — sem isso as
	 * respostas podem chegar fora de ordem e sobrescrever a tela com dado velho.
	 */
	dashboard: (data?: string, signal?: AbortSignal) =>
		get<PainelDia>(`/admin/dashboard${data ? `?data=${data}` : ''}`, signal),

	/** Contadores dos badges do menu, para qualquer tela do admin. */
	resumo: (signal?: AbortSignal) => get<ResumoAdmin>('/admin/resumo', signal),

	/** Dias em aberto (marcação ímpar) do mês, por colaborador. */
	pendencias: (mes?: string) => get<Pendencias>(`/admin/pendencias${mes ? `?mes=${mes}` : ''}`)
};
