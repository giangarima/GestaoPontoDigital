/**
 * @module lib/server/timesheet
 * @description Utilitários server-side para cálculo de resumo diário de ponto.
 *
 * Conformidade com Portaria 671/2021:
 *  - Registros são imutáveis.
 *  - Correções via batidas manuais (criadoPor) ou anulações (RegistroAnulacao).
 *
 * Nota: os campos do DTO (`type`/`timestamp`/`method`/`createdBy`) mantêm o
 * contrato estável da API; o mapper traduz dos campos do schema (`tipo`/
 * `marcadoEm`/`metodo`/`criadoPor`).
 *  - Cálculo ignora batidas anuladas, mas o DTO continua expondo a anulação
 *    para que o front exiba a marcação visual e o AFD futuro liste tudo.
 */

import type { Registro, RegistroAnulacao } from '@/lib/server/prisma-client/client';
import { formatNsr } from '@/lib/server/nsr';

export interface AnulacaoDTO {
	motivo: string;
	anuladoPor: string;
	anuladoEm: string;
	/** Batida corrigida que substituiu esta (ajuste). Nulo em anulação avulsa. */
	registroSubstitutoId: string | null;
}

export interface RegistroDTO {
	id: string;
	colaboradorId: string;
	type: string;
	timestamp: string;
	method: string;
	createdBy: string | null;
	createdReason: string | null;
	nsr?: string;
	anulacao: AnulacaoDTO | null;
}

export interface DailySummaryDTO {
	date: string;
	registros: RegistroDTO[];
	totalHours: number;
	overtime: number;
	deficit: number;
	abonado: boolean;
}

export type RegistroComAnulacao = Registro & { anulacao?: RegistroAnulacao | null };

export function toRegistroDTO(p: RegistroComAnulacao): RegistroDTO {
	return {
		id: p.id,
		colaboradorId: p.colaboradorId,
		type: p.tipo,
		timestamp: p.marcadoEm.toISOString(),
		method: p.metodo,
		createdBy: p.criadoPor ?? null,
		createdReason: p.criadoMotivo ?? null,
		nsr: p.nsr ? formatNsr(p.nsr) : undefined,
		anulacao: p.anulacao
			? {
					motivo: p.anulacao.motivo,
					anuladoPor: p.anulacao.anuladoPor,
					anuladoEm: p.anulacao.anuladoEm.toISOString(),
					registroSubstitutoId: p.anulacao.registroSubstitutoId ?? null
				}
			: null
	};
}

export function dateKey(date: Date): string {
	return date.toISOString().split('T')[0];
}

/**
 * Expande ausências [dataInicio, dataFim] no conjunto de datas (YYYY-MM-DD) que
 * cobrem — usado para abonar dias no espelho/histórico. Substitui o antigo
 * `justificativa.data` (ponto único) agora que a ausência tem intervalo.
 */
export function ausenciaDateKeys(ausencias: { dataInicio: Date; dataFim: Date }[]): Set<string> {
	const keys = new Set<string>();
	for (const a of ausencias) {
		const d = new Date(
			Date.UTC(a.dataInicio.getUTCFullYear(), a.dataInicio.getUTCMonth(), a.dataInicio.getUTCDate())
		);
		const fim = Date.UTC(
			a.dataFim.getUTCFullYear(),
			a.dataFim.getUTCMonth(),
			a.dataFim.getUTCDate()
		);
		while (d.getTime() <= fim) {
			keys.add(dateKey(d));
			d.setUTCDate(d.getUTCDate() + 1);
		}
	}
	return keys;
}

/**
 * Agrupa pontos por data e calcula totalHours / overtime / deficit por dia.
 * Regra: totalHours = (saida_almoco - entrada) + (saida - retorno_almoco) em horas decimais.
 * Batidas anuladas são exibidas no DTO mas ignoradas no cálculo.
 * Se faltar qualquer um dos 4 tipos válidos, totalHours = 0. Jornada base: 8h/dia.
 * Dias com justificativa aprovada (abonado) têm deficit zerado.
 */
/** Predicado que define quais registros contam para o cálculo de horas. */
export type RegistroValido = (p: RegistroComAnulacao) => boolean;

/** Padrão: ignora batidas anuladas (estado efetivo). */
const NAO_ANULADA: RegistroValido = (p) => !p.anulacao;

export function buildDailySummaries(
	registros: RegistroComAnulacao[],
	datasAbonadas: Set<string> = new Set(),
	isValida: RegistroValido = NAO_ANULADA
): DailySummaryDTO[] {
	const byDay = new Map<string, RegistroComAnulacao[]>();

	for (const p of registros) {
		const key = dateKey(p.marcadoEm);
		const list = byDay.get(key) ?? [];
		list.push(p);
		byDay.set(key, list);
	}

	const summaries: DailySummaryDTO[] = [];
	for (const [date, dayRegistros] of byDay.entries()) {
		dayRegistros.sort((a, b) => a.marcadoEm.getTime() - b.marcadoEm.getTime());
		summaries.push(buildSummary(date, dayRegistros, datasAbonadas.has(date), isValida));
	}

	summaries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
	return summaries;
}

export function buildSummary(
	date: string,
	registros: RegistroComAnulacao[],
	abonado = false,
	isValida: RegistroValido = NAO_ANULADA
): DailySummaryDTO {
	const validas = registros.filter(isValida);
	const byType = new Map(validas.map((p) => [p.tipo, p]));
	const entrada = byType.get('entrada');
	const saidaAlmoco = byType.get('saida_almoco');
	const retornoAlmoco = byType.get('retorno_almoco');
	const saida = byType.get('saida');

	let totalHours = 0;
	if (entrada && saidaAlmoco && retornoAlmoco && saida) {
		const manha = (saidaAlmoco.marcadoEm.getTime() - entrada.marcadoEm.getTime()) / 3_600_000;
		const tarde = (saida.marcadoEm.getTime() - retornoAlmoco.marcadoEm.getTime()) / 3_600_000;
		totalHours = Number((manha + tarde).toFixed(2));
	}

	const JORNADA_BASE = 8;
	const overtime = Math.max(0, Number((totalHours - JORNADA_BASE).toFixed(2)));
	const deficit = abonado
		? 0
		: totalHours > 0
			? Math.max(0, Number((JORNADA_BASE - totalHours).toFixed(2)))
			: 0;

	return {
		date,
		registros: registros.map(toRegistroDTO),
		totalHours,
		overtime,
		deficit,
		abonado
	};
}
