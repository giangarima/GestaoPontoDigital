/**
 * @module lib/server/registro-hash
 * @description Núcleo PURO da cadeia de integridade das batidas (sem Prisma).
 *
 * Isolado de `registro-ledger.ts` para poder ser importado tanto pela aplicação
 * (via alias `@/`) quanto pelo seed (`prisma/seed.ts`, rodado por `tsx` sem alias),
 * garantindo que a serialização canônica seja EXATAMENTE a mesma nos dois lados —
 * qualquer divergência invalidaria as cadeias já gravadas.
 */
import { createHash } from 'node:crypto';

/** Hash "genesis": ancora o primeiro elo da cadeia de cada empresa. */
export const GENESIS_HASH = '0'.repeat(64);

/** Campos que entram na assinatura de integridade de uma batida. */
export interface RegistroChainInput {
	empresaId: string;
	colaboradorId: string;
	nsr: bigint;
	tipo: string;
	marcadoEm: Date;
	metodo: string;
	criadoPor?: string | null;
	criadoMotivo?: string | null;
}

/**
 * Serialização canônica: ordem fixa de campos, timestamp ISO UTC, nulos como "".
 * Precisa ser idêntica na criação e na verificação.
 */
export function canonicalRegistro(r: RegistroChainInput): string {
	return [
		r.empresaId,
		r.colaboradorId,
		r.nsr.toString(),
		r.tipo,
		r.marcadoEm.toISOString(),
		r.metodo,
		r.criadoPor ?? '',
		r.criadoMotivo ?? ''
	].join('|');
}

/** Hash de uma batida encadeado ao hash da anterior. */
export function hashRegistro(r: RegistroChainInput, hashAnterior: string): string {
	return createHash('sha256')
		.update(`${hashAnterior}|${canonicalRegistro(r)}`)
		.digest('hex');
}
