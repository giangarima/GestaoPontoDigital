/**
 * @module lib/server/registro-hash
 * @description Hash SHA-256 do registro de marcação (AFD tipo 7, Portaria 671/2021),
 * PURO (sem Prisma nem alias `@/`) para ser compartilhado pela aplicação e pelo seed.
 *
 * O hash é calculado sobre os campos JÁ FORMATADOS do AFD, na ordem oficial, de
 * modo que o valor gravado seja exatamente o campo 8 do registro tipo 7. Encadeia
 * ao hash do registro (tipo 7) anterior — alterar uma batida antiga quebra a
 * cadeia (detectável por `verificarCadeia`).
 *
 * IMPORTANTE: mudar `canonicalRegistro` invalida todas as cadeias já gravadas.
 */
import { createHash } from 'node:crypto';
import { padNum, toDH, COLETOR_BROWSER, MARCACAO_ONLINE } from './afd/format';

/** Campos do registro tipo 7 que entram no hash SHA-256. */
export interface RegistroChainInput {
	nsr: bigint;
	marcadoEm: Date;
	cpf: string;
	registradoEm: Date;
}

/**
 * Conteúdo canônico (campos formatados do AFD, ordem oficial) + hash do registro
 * anterior (vazio no primeiro elo). Ordem: NSR, tipo "7", DH marcação, CPF,
 * DH gravação, coletor, on/off-line, hash anterior.
 */
export function canonicalRegistro(r: RegistroChainInput, hashAnterior: string | null): string {
	return (
		padNum(r.nsr, 9) +
		'7' +
		toDH(r.marcadoEm) +
		padNum(r.cpf, 12) +
		toDH(r.registradoEm) +
		COLETOR_BROWSER +
		MARCACAO_ONLINE +
		(hashAnterior ?? '')
	);
}

/** Hash SHA-256 (hex) do registro tipo 7, encadeado ao anterior. */
export function hashRegistro(r: RegistroChainInput, hashAnterior: string | null): string {
	return createHash('sha256').update(canonicalRegistro(r, hashAnterior), 'latin1').digest('hex');
}
