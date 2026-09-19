/**
 * @module lib/server/periodo
 * @description Dias de calendário no fuso de Brasília (UTC-03:00; o Brasil não
 * tem horário de verão desde 2019). Não depende do fuso do servidor — no
 * Render ele é UTC.
 *
 * O banco guarda dois tipos de data, e cada um vira "dia" de um jeito:
 *  - **instante** (`Registro.marcadoEm`, timestamptz): o dia é o de Brasília.
 *    Uma batida às 22h de 05/01 (01h UTC de 06/01) pertence ao dia 05/01.
 *  - **data pura** (`Ausencia.dataInicio/dataFim`, `JornadaVersao.vigenciaInicio`):
 *    gravada à meia-noite UTC do dia civil (convenção de `parseDataUTC`).
 *
 * Misturar os dois — ex.: limitar o período das batidas com `T00:00Z` — desloca
 * 3 h e joga as batidas noturnas no dia seguinte.
 */
import { toD } from '@/lib/server/afd/format';

/** Dia de calendário no formato `AAAA-MM-dd`. */
export type Dia = string;

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** `true` se `s` é um dia válido no formato `AAAA-MM-dd` (rejeita 2026-02-30). */
export function ehDia(s: string | null | undefined): s is Dia {
	if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	return dataPura(s).toISOString().slice(0, 10) === s;
}

/** Dia (de Brasília) em que o instante aconteceu. */
export function diaDe(instante: Date): Dia {
	return toD(instante);
}

/** Minutos desde a meia-noite de Brasília (0–1439). */
export function minutosDoDia(instante: Date): number {
	const brt = new Date(instante.getTime() - BRT_OFFSET_MS);
	return brt.getUTCHours() * 60 + brt.getUTCMinutes();
}

/** Primeiro instante do dia em Brasília (00:00:00.000-03:00). */
export function inicioDoDia(dia: Dia): Date {
	return new Date(`${dia}T00:00:00.000-03:00`);
}

/** Último instante do dia em Brasília (23:59:59.999-03:00). */
export function fimDoDia(dia: Dia): Date {
	return new Date(`${dia}T23:59:59.999-03:00`);
}

/** Dia como data pura (meia-noite UTC) — formato das colunas `@db.Date`/ausências. */
export function dataPura(dia: Dia): Date {
	return new Date(`${dia}T00:00:00.000Z`);
}

/** Dia de uma data pura (meia-noite UTC). */
export function diaDaDataPura(data: Date): Dia {
	return data.toISOString().slice(0, 10);
}

/** Primeiro e último dia do mês `AAAA-MM`. */
export function diasDoMes(mes: string): { inicio: Dia; fim: Dia } {
	const [ano, m] = mes.split('-').map(Number);
	const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
	return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

/** Filtro Prisma dos instantes do período [inicio, fim] (dias inteiros de Brasília). */
export function instantesDoPeriodo(inicio: Dia, fim: Dia): { gte: Date; lte: Date } {
	return { gte: inicioDoDia(inicio), lte: fimDoDia(fim) };
}

/** Filtro Prisma das ausências (datas puras) que tocam o período [inicio, fim]. */
export function ausenciaNoPeriodo(
	inicio: Dia,
	fim: Dia
): { dataInicio: { lte: Date }; dataFim: { gte: Date } } {
	return { dataInicio: { lte: dataPura(fim) }, dataFim: { gte: dataPura(inicio) } };
}
