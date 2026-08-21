import { prisma } from '@/lib/server/db';
import { allocateNsr } from '@/lib/server/nsr';
import type { Prisma } from '@/lib/server/prisma-client/client';

export interface CreateRegistroInput {
	colaboradorId: string;
	empresaId: string;
	tipo: string;
	metodo: string;
	marcadoEm?: Date;
	criadoPor?: string | null;
	criadoMotivo?: string | null;
}

type DbClient = typeof prisma | Prisma.TransactionClient;

export async function createRegistroComNsr(
	input: CreateRegistroInput,
	tx?: Prisma.TransactionClient
) {
	const run = async (client: DbClient) => {
		const nsr = await allocateNsr(client, input.empresaId);
		return client.registro.create({
			data: {
				colaboradorId: input.colaboradorId,
				empresaId: input.empresaId,
				tipo: input.tipo,
				metodo: input.metodo,
				marcadoEm: input.marcadoEm ?? new Date(),
				criadoPor: input.criadoPor ?? null,
				criadoMotivo: input.criadoMotivo ?? null,
				nsr
			}
		});
	};

	if (tx) return run(tx);
	return prisma.$transaction(run);
}

export default createRegistroComNsr;
