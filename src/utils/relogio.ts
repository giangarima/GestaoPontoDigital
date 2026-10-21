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

/** Dia ("2026-09-01") e hora ("19:08") de um instante, no fuso de Brasília. */
export function diaEHoraBrasilia(instante: Date | string): { dia: string; hora: string } {
	const p = Object.fromEntries(
		new Intl.DateTimeFormat('en-CA', {
			timeZone: FUSO_BRASILIA,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		})
			.formatToParts(new Date(instante))
			.map((x) => [x.type, x.value])
	);
	return {
		dia: `${p.year}-${p.month}-${p.day}`,
		hora: `${p.hour === '24' ? '00' : p.hour}:${p.minute}`
	};
}

/**
 * Instante de um horário ("HH:MM") num dia de Brasília. O fuso é fixo em −03:00,
 * como no servidor (`periodo.ts`): o Brasil não tem horário de verão desde 2019.
 */
export function instanteBrasilia(dia: string, hora: string): Date {
	return new Date(`${dia}T${hora}:00-03:00`);
}
