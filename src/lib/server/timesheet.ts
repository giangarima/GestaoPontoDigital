/**
 * @module lib/server/timesheet
 * @description Utilitários server-side para cálculo de resumo diário de ponto.
 *
 * Conformidade com Portaria 671/2021:
 *  - Registros são imutáveis.
 *  - Correções via inclusões do admin (fonte "I") ou anulações (RegistroAnulacao).
 *  - Horas apuradas contra a jornada contratual, com hora noturna reduzida
 *    (`apuracao.ts`) — não mais contra 8h fixas.
 *
 * Nota: os campos do DTO (`type`/`timestamp`/`method`/`createdBy`) mantêm o
 * contrato estável da API; o mapper traduz dos campos do schema (`tipo`/
 * `marcadoEm`/`metodo`/`criadoPor`).
 *  - Cálculo ignora batidas anuladas, mas o DTO continua expondo a anulação
 *    para que o front exiba a marcação visual e o AFD futuro liste tudo.
 */

import type { Registro, RegistroAnulacao } from '@/lib/server/prisma-client/client';
import { formatNsr } from '@/lib/server/nsr';
import { dataPura, diaDaDataPura, diaDe } from '@/lib/server/periodo';
import { apurarDia } from '@/lib/server/apuracao';

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

/** Dia (AAAA-MM-dd, fuso de Brasília) em que a batida aconteceu — chave de agrupamento. */
export function dateKey(date: Date): string {
	return diaDe(date);
}

/**
 * Expande ausências [dataInicio, dataFim] no conjunto de datas (YYYY-MM-DD) que
 * cobrem — usado para abonar dias no espelho/histórico. Substitui o antigo
 * `justificativa.data` (ponto único) agora que a ausência tem intervalo.
 */
export function ausenciaDateKeys(ausencias: { dataInicio: Date; dataFim: Date }[]): Set<string> {
	// dataInicio/dataFim são datas puras (meia-noite UTC do dia civil) — ver periodo.ts.
	const keys = new Set<string>();
	for (const a of ausencias) {
		const d = dataPura(diaDaDataPura(a.dataInicio));
		const fim = dataPura(diaDaDataPura(a.dataFim)).getTime();
		while (d.getTime() <= fim) {
			keys.add(diaDaDataPura(d));
			d.setUTCDate(d.getUTCDate() + 1);
		}
	}
	return keys;
}

/** Predicado que define quais registros contam para o cálculo de horas. */
export type RegistroValido = (p: RegistroComAnulacao) => boolean;

/** Padrão: ignora batidas anuladas (estado efetivo). */
const NAO_ANULADA: RegistroValido = (p) => !p.anulacao;

export interface OpcoesResumo {
	/** Minutos contratuais do dia (0 = folga; `null` = sem jornada). Ver `contratualPorDia`. */
	contratualMin: (dia: string) => number | null;
	/** Dias (AAAA-MM-dd) com ausência aprovada — sem déficit. */
	datasAbonadas?: Set<string>;
	/** Quais registros contam (padrão: os não anulados). */
	isValida?: RegistroValido;
	/** Dia de hoje: hoje e depois o dia ainda está em andamento (sem déficit). */
	hoje?: string;
}

/**
 * Agrupa pontos por dia (Brasília) e apura horas / extras / déficit de cada um
 * contra a jornada contratual do colaborador (ver `apuracao.ts`). Batidas
 * anuladas aparecem no DTO, mas não entram no cálculo.
 */
export function buildDailySummaries(
	registros: RegistroComAnulacao[],
	opcoes: OpcoesResumo
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
		summaries.push(buildSummary(date, dayRegistros, opcoes));
	}

	summaries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
	return summaries;
}

const horas = (min: number) => Number((min / 60).toFixed(2));

export function buildSummary(
	date: string,
	registros: RegistroComAnulacao[],
	opcoes: OpcoesResumo
): DailySummaryDTO {
	const isValida = opcoes.isValida ?? NAO_ANULADA;
	const abonado = opcoes.datasAbonadas?.has(date) ?? false;
	const emAndamento = date >= (opcoes.hoje ?? diaDe(new Date()));
	const apuracao = apurarDia(
		registros.filter(isValida).map((p) => p.marcadoEm),
		opcoes.contratualMin(date),
		abonado
	);

	return {
		date,
		registros: registros.map(toRegistroDTO),
		totalHours: horas(apuracao.realizadoMin),
		overtime: horas(apuracao.extraMin),
		deficit: emAndamento ? 0 : horas(apuracao.deficitMin),
		abonado
	};
}
