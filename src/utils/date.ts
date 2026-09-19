/**
 * @module utils/date
 * @description Funções utilitárias para formatação e cálculo de datas/horas.
 *
 * Usa Intl.DateTimeFormat nativo — sem dependência de libs externas.
 */

const LOCALE = 'pt-BR';
const TIMEZONE = 'America/Sao_Paulo';

/** "25/03/2026" */
export function formatDate(date: Date | string): string {
	// Strings "YYYY-MM-DD" são interpretadas como UTC pelo Date constructor,
	// causando deslocamento de fuso. Adicionamos T00:00 para forçar leitura local.
	const d =
		typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
			? new Date(`${date}T00:00`)
			: new Date(date);
	return new Intl.DateTimeFormat(LOCALE, {
		timeZone: TIMEZONE,
		day: '2-digit',
		month: '2-digit',
		year: 'numeric'
	}).format(d);
}

/** "2026-03-25" (AAAA-MM-dd) no fuso de Brasília — formato das datas enviadas à API. */
export function toDateKey(date: Date | string): string {
	// en-CA formata como AAAA-MM-dd; toISOString() daria o dia em UTC (errado após as 21h).
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: TIMEZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date(date));
}

/** "08:32" */
export function formatTime(date: Date | string): string {
	return new Intl.DateTimeFormat(LOCALE, {
		timeZone: TIMEZONE,
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).format(new Date(date));
}

/** "08h 32min" */
export function formatHoursMinutes(totalMinutes: number): string {
	const totalAbs = Math.round(Math.abs(totalMinutes));
	const h = Math.floor(totalAbs / 60);
	const m = totalAbs % 60;
	const sign = totalMinutes < 0 ? '-' : '';
	return `${sign}${h}h ${String(m).padStart(2, '0')}min`;
}

/** Diferença em minutos entre dois timestamps */
export function diffInMinutes(start: Date | string, end: Date | string): number {
	const ms = new Date(end).getTime() - new Date(start).getTime();
	return Math.round(ms / 60_000);
}

/** Verifica se uma data é hoje */
export function isToday(date: Date | string): boolean {
	const d = new Date(date);
	const now = new Date();
	return (
		d.getFullYear() === now.getFullYear() &&
		d.getMonth() === now.getMonth() &&
		d.getDate() === now.getDate()
	);
}
