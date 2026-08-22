/**
 * @module lib/server/afd/format
 * @description Primitivas de formatação do AFD (Portaria 671/2021), PURAS (sem
 * Prisma nem alias `@/`) para serem compartilhadas pela aplicação e pelo seed.
 *
 * Regras do leiaute: campos numéricos (N) preenchidos à esquerda com "0"; campos
 * alfanuméricos (A) preenchidos à direita com espaço; datas em ISO 8859-1; fuso
 * fixo de Brasília (-0300, o Brasil não tem horário de verão desde 2019).
 */

/** Fuso de Brasília em minutos (UTC-03:00). */
const BRT_OFFSET_MIN = -180;

/** Constantes de marcação do REP-P (campos 6 e 7 do registro tipo 7). */
export const COLETOR_BROWSER = '02'; // navegador internet
export const MARCACAO_ONLINE = '0'; // "0" on-line | "1" off-line

/** Literal de assinatura para REP-P/REP-A (a assinatura real vai no arquivo .p7s). */
export const ASSINATURA_LITERAL = 'ASSINATURA_DIGITAL_EM_ARQUIVO_P7S';

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

/** Desloca o instante para a hora-relógio de Brasília (para ler via getUTC*). */
function toBrt(date: Date): Date {
	return new Date(date.getTime() + BRT_OFFSET_MIN * 60_000);
}

/** Campo N: só dígitos, alinhado à direita com "0" à esquerda. */
export function padNum(value: string | number | bigint, width: number): string {
	const s = String(value).replace(/\D/g, '');
	return s.padStart(width, '0').slice(-width);
}

/**
 * Campo A: alinhado à esquerda, completado com espaços à direita (trunca se
 * exceder). Caracteres fora do ISO-8859-1 (codepoint > 255, ex.: travessão "—")
 * viram "?" para não corromper a codificação do arquivo.
 */
export function padAlpha(value: string | null | undefined, width: number): string {
	const s = (value ?? '').slice(0, width);
	let out = '';
	for (let i = 0; i < s.length; i++) {
		out += s.charCodeAt(i) > 255 ? '?' : s[i];
	}
	return out.padEnd(width, ' ');
}

/** Campo D: data "AAAA-MM-dd" no fuso de Brasília. */
export function toD(date: Date): string {
	const d = toBrt(date);
	return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Campo DH: "AAAA-MM-ddThh:mm:00-0300" (segundos fixos "00", fuso Brasília). */
export function toDH(date: Date): string {
	const d = toBrt(date);
	return (
		`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}` +
		`T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:00-0300`
	);
}

/**
 * CRC-16/KERMIT (CCITT-TRUE) do registro — polinômio refletido 0x8408, init 0.
 * Referência do leiaute: os 9 caracteres "123456789" geram 0x2189.
 * Retorna 4 hex maiúsculos, sem "0x".
 */
export function crc16kermit(input: string): string {
	let crc = 0;
	for (let i = 0; i < input.length; i++) {
		crc ^= input.charCodeAt(i) & 0xff;
		for (let j = 0; j < 8; j++) {
			crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
		}
	}
	return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}
