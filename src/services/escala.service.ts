/**
 * @module services/escala.service
 * @description Escala de folga: ciclo por colaborador (6x1, 5x2, 12x36…) e ajustes pontuais.
 */

import { get, put } from './api';

export type SituacaoEscala =
	| 'trabalho'
	| 'folga'
	| 'feriado'
	/** Folga compensatória: consome banco de horas. */
	| 'folga_banco'
	/** Férias, atestado e outras ausências aprovadas. */
	| 'ausencia'
	| 'sem_jornada';
export type OrigemDia = 'ajuste' | 'ciclo' | 'jornada';

export interface DiaEscala {
	dia: string;
	situacao: SituacaoEscala;
	origem: OrigemDia;
	/** Ciclo manda trabalhar, mas a jornada não tem horário nesse dia da semana. */
	semHorario: boolean;
	/** Minutos contratuais pela escala (o que uma folga compensatória consome). */
	contratualMin: number;
	ausenciaId: string | null;
	ausenciaTipo: string | null;
}

export interface AlertaEscala {
	tipo: 'sem_repouso' | 'sem_domingo' | 'sem_horario';
	dia: string;
	mensagem: string;
}

export interface LinhaEscala {
	id: string;
	nome: string;
	cargo: string | null;
	departamento: { id: string; nome: string } | null;
	/** Sequência do ciclo vigente no fim do mês (`null` = padrão semanal da jornada). */
	ciclo: string | null;
	dias: DiaEscala[];
	alertas: AlertaEscala[];
}

export interface GradeEscala {
	mes: string;
	/** Marcar folga num dia de trabalho desconta do banco de horas. */
	bancoAtivo: boolean;
	feriados: { dia: string; nome: string; tipo: 'feriado' | 'ponto_facultativo' }[];
	colaboradores: LinhaEscala[];
}

export interface CicloEscala {
	vigenciaInicio: string;
	sequencia: string | null;
}

/** Presets oferecidos na tela (mesmos de `escala/calendario.ts`). */
export const CICLOS_PADRAO: Record<string, string> = {
	'6x1': 'TTTTTTF',
	'5x2': 'TTTTTFF',
	'4x2': 'TTTTFF',
	'12x36': 'TF'
};

export const escalaService = {
	grade: (mes: string, departamentoId?: string) =>
		get<GradeEscala>(
			`/escala?mes=${mes}${departamentoId ? `&departamentoId=${departamentoId}` : ''}`
		),
	ciclos: (colaboradorId: string) => get<CicloEscala[]>(`/colaboradores/${colaboradorId}/escala`),
	definirCiclo: (colaboradorId: string, ciclo: CicloEscala) =>
		put<CicloEscala>(`/colaboradores/${colaboradorId}/escala`, ciclo),
	ajustar: (colaboradorId: string, data: string, trabalha: boolean | null, motivo?: string) =>
		put<unknown>('/escala/ajuste', { colaboradorId, data, trabalha, motivo })
};
