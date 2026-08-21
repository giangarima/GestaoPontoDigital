import { prisma } from '@/lib/server/db';
import { requireUser, jsonOk, jsonError } from '../../_lib/auth-helpers';
import { formatNsr } from '@/lib/server/nsr';

type ComprovanteListRow = {
	registroId: string;
	nsr: bigint;
	geradoEm: Date;
	enviadoEm: Date | null;
	envioStatus: string;
	caminhoArquivo: string;
};

export async function GET(request: Request) {
	try {
		const user = requireUser(request);
		const empresaId = user.empresaId;
		let colaboradorId: string | null = null;
		if (user.role === 'colaborador') {
			colaboradorId = user.colaboradorId as string;
			if (!colaboradorId) return jsonError('Usuário não é colaborador', 403);
		} else {
			const url = new URL(request.url);
			colaboradorId = url.searchParams.get('colaboradorId');
			if (!colaboradorId) return jsonError('colaboradorId é obrigatório para admin', 400);
		}

		const since = new Date(Date.now() - 48 * 3600 * 1000);
		const rows = (await prisma.comprovante.findMany({
			where: { empresaId, colaboradorId, geradoEm: { gte: since } },
			orderBy: { geradoEm: 'desc' },
			select: {
				registroId: true,
				nsr: true,
				geradoEm: true,
				enviadoEm: true,
				envioStatus: true,
				caminhoArquivo: true
			}
		})) as ComprovanteListRow[];

		const list = rows.map((r) => ({
			registroId: r.registroId,
			nsr: formatNsr(r.nsr),
			geradoEm: r.geradoEm.toISOString(),
			enviadoEm: r.enviadoEm?.toISOString() ?? null,
			envioStatus: r.envioStatus,
			downloadUrl: `/api/timesheet/comprovantes/${r.registroId}`
		}));

		return jsonOk(list);
	} catch (error: unknown) {
		return jsonError(error instanceof Error ? error.message : 'Erro', 500);
	}
}

export default { GET };
