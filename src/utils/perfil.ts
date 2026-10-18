/**
 * @module utils/perfil
 * @description Textos do perfil do colaborador: minutos legíveis e rótulos de dia.
 */

/** "25 min", "1h05", "−2h10" (sinal só quando pedido). */
export function formatMinutos(min: number, comSinal = false): string {
	const sinal = comSinal ? (min > 0 ? '+' : min < 0 ? '−' : '') : min < 0 ? '−' : '';
	const abs = Math.abs(Math.round(min));
	if (abs < 60) return `${sinal}${abs} min`;
	return `${sinal}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, '0')}`;
}

/** "05/01/2026" a partir de "2026-01-05". */
export function formatDia(dia: string): string {
	const [ano, mes, d] = dia.split('-');
	return `${d}/${mes}/${ano}`;
}

/** "05/01" a partir de "2026-01-05". */
export function diaMes(dia: string): string {
	const [, mes, d] = dia.split('-');
	return `${d}/${mes}`;
}

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** "Seg" a partir de "2026-01-05" (data de calendário, sem fuso). */
export function diaDaSemana(dia: string): string {
	return SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()];
}
