/**
 * @module services/feriado.service
 * @description Feriados e pontos facultativos da empresa, com a escala de quem trabalha.
 */

import { get, post, put, del } from './api';

export type TipoFeriado = 'feriado' | 'ponto_facultativo';
export type Abrangencia = 'nacional' | 'estadual' | 'municipal';

/** Feriado do dia visto por um colaborador (espelho, histórico, painel). */
export interface FeriadoDoDia {
	nome: string;
	tipo: TipoFeriado;
	abrangencia: Abrangencia;
	/** Escalado para trabalhar: o dia segue a jornada. */
	escalado: boolean;
}

export const ROTULO_TIPO: Record<TipoFeriado, string> = {
	feriado: 'Feriado',
	ponto_facultativo: 'Ponto facultativo'
};

export interface Feriado {
	/** `null` em feriado nacional sem escala — não tem linha no banco. */
	id: string | null;
	data: string;
	nome: string;
	tipo: TipoFeriado;
	abrangencia: Abrangencia;
	/** Feriado nacional fixo em lei: não se exclui. */
	lei: boolean;
	/** Colaboradores escalados para trabalhar. Vazio = empresa fechada. */
	escalados: string[];
}

export interface SugestaoFeriado {
	data: string;
	nome: string;
	tipo: TipoFeriado;
	abrangencia: Abrangencia;
}

export interface FeriadosDoAno {
	ano: number;
	feriados: Feriado[];
	/** Datas móveis (Carnaval, Sexta-feira Santa, Corpus Christi) ainda não cadastradas. */
	sugestoes: SugestaoFeriado[];
}

export interface FeriadoInput {
	data: string;
	nome: string;
	tipo: TipoFeriado;
	abrangencia: Abrangencia;
}

export const feriadoService = {
	list: (ano: number) => get<FeriadosDoAno>(`/feriados?ano=${ano}`),
	create: (data: FeriadoInput) => post<Feriado>('/feriados', data),
	remove: (id: string) => del<void>(`/feriados/${id}`),
	definirEscala: (data: string, colaboradorIds: string[]) =>
		put<{ data: string; escalados: string[] }>('/feriados/escala', { data, colaboradorIds })
};
