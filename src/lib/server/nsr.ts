import { prisma } from './db';
import type { Prisma } from './prisma-client/client';

type DbClient = typeof prisma | Prisma.TransactionClient;
type SequenceRow = { nsr: bigint | number | string };

/**
 * Aloca próximo NSR da empresa de forma atômica.
 * Aceita um cliente de transação (tx) ou usa o singleton `prisma`.
 */
export async function allocateNsr(
	clientOrEmpresaId: DbClient | string,
	maybeEmpresaId?: string
): Promise<bigint> {
	// chamada: allocateNsr(tx, empresaId) ou allocateNsr(empresaId)
	const client = typeof clientOrEmpresaId === 'string' ? prisma : clientOrEmpresaId;
	const empresaId = typeof clientOrEmpresaId === 'string' ? clientOrEmpresaId : maybeEmpresaId;

	if (!empresaId) {
		throw new Error('empresaId é obrigatório para alocar NSR');
	}

	const rows = await client.$queryRaw<SequenceRow[]>`
    INSERT INTO empresa_nsr_sequencias (empresa_id, proximo_nsr)
    VALUES (${empresaId}, 2)
    ON CONFLICT (empresa_id)
    DO UPDATE SET proximo_nsr = empresa_nsr_sequencias.proximo_nsr + 1
    RETURNING proximo_nsr - 1 AS nsr
  `;

	const nsrVal = rows[0]?.nsr ?? 0;
	return BigInt(nsrVal);
}

/** Formata NSR com 9 dígitos */
export function formatNsr(nsr: bigint | number): string {
	const s = String(nsr);
	return s.padStart(9, '0');
}

export default { allocateNsr, formatNsr };
