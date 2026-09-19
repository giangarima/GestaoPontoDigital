/**
 * @module utils/relogio
 * @description Relógio da tela de registro alinhado ao servidor (o REP-P).
 * Estima quanto o relógio do dispositivo difere do servidor a partir de uma
 * ida e volta HTTP, supondo o caminho simétrico (como o NTP): o servidor leu
 * a hora no meio da viagem.
 */

/** Servidor − dispositivo (ms). Some ao `Date.now()` para obter a hora do servidor. */
export function desvioDoServidor(
	enviadoEmMs: number,
	recebidoEmMs: number,
	servidorMs: number
): number {
	return Math.round(servidorMs - (enviadoEmMs + recebidoEmMs) / 2);
}

const FUSO_BRASILIA = 'America/Sao_Paulo';

/** "13:29:05" no fuso de Brasília, qualquer que seja o fuso do dispositivo. */
export function horaBrasilia(data: Date): string {
	return data.toLocaleTimeString('pt-BR', {
		timeZone: FUSO_BRASILIA,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	});
}

/** "sábado, 19 de setembro de 2026" no fuso de Brasília. */
export function dataBrasiliaExtenso(data: Date): string {
	return data.toLocaleDateString('pt-BR', {
		timeZone: FUSO_BRASILIA,
		weekday: 'long',
		day: '2-digit',
		month: 'long',
		year: 'numeric'
	});
}
