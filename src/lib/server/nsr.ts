/**
 * Formata o NSR com 9 dígitos, como no AFD e no comprovante. A alocação do NSR
 * é `proximoNsr`, em `registro-ledger.ts`.
 */
export function formatNsr(nsr: bigint | number): string {
	return String(nsr).padStart(9, '0');
}
