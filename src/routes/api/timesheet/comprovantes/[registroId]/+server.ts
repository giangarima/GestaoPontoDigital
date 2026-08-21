import { prisma } from '@/lib/server/db';
import { requireUser, jsonError } from '../../../_lib/auth-helpers';
import { lerComprovantePdf } from '@/lib/server/comprovante/storage';
import { formatNsr } from '@/lib/server/nsr';

type ComprovanteDetalhe = {
	registroId: string;
	empresaId: string;
	colaboradorId: string;
	nsr: bigint;
	caminhoArquivo: string;
};

export async function GET(request: Request, { params }: { params: { registroId: string } }) {
	try {
		const user = requireUser(request);
		const registroId = params.registroId;

		const comprovante = (await prisma.comprovante.findUnique({
			where: { registroId }
		})) as ComprovanteDetalhe | null;
		if (!comprovante) return jsonError('Comprovante não encontrado', 404);
		if (comprovante.empresaId !== user.empresaId) return jsonError('Acesso negado', 403);
		if (user.role === 'colaborador' && user.colaboradorId !== comprovante.colaboradorId)
			return jsonError('Acesso negado', 403);

		const buffer = await lerComprovantePdf(comprovante.caminhoArquivo);
		const filename = `comprovante-ponto-${formatNsr(comprovante.nsr)}.pdf`;

		return new Response(new Uint8Array(buffer), {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `attachment; filename="${filename}"`
			}
		});
	} catch (error: unknown) {
		return jsonError(error instanceof Error ? error.message : 'Erro', 500);
	}
}

export default { GET };
