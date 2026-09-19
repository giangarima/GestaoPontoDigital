/**
 * @endpoint GET /api/timesheet/comprovantes/:registroId
 * @description PDF do comprovante de uma marcação original. O próprio
 * trabalhador ou um admin da empresa. Se o arquivo guardado não existe mais
 * (disco efêmero), o comprovante é regerado a partir do banco.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '@/lib/server/db';
import { obterComprovantePdf } from '@/lib/server/comprovante/emitir';
import { requireUser, jsonError } from '../../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request, params }) => {
	let user;
	try {
		user = requireUser(request);
	} catch (response) {
		return response as Response;
	}

	const registro = await prisma.registro.findUnique({
		where: { id: params.registroId },
		select: { id: true, empresaId: true, colaboradorId: true, fonte: true }
	});
	if (!registro || registro.empresaId !== user.empresaId || registro.fonte !== 'O') {
		return jsonError('Comprovante não encontrado', 404);
	}
	if (registro.colaboradorId !== user.colaboradorId && user.role !== 'admin') {
		return jsonError('Acesso negado', 403);
	}

	const { pdf, nome } = await obterComprovantePdf(registro.id);
	return new Response(new Uint8Array(pdf), {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${nome}"`
		}
	});
};
