/**
 * @endpoint DELETE /api/admin/banco-horas/:colaboradorId/folgas/:id
 * @description Cancela uma folga compensatória: o saldo volta ao banco.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '@/lib/server/db';
import { TIPO_FOLGA } from '@/lib/server/banco-horas/carregar';
import { requireAdmin, jsonError } from '../../../../../_lib/auth-helpers';

export const DELETE: RequestHandler = async ({ request, params }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const folga = await prisma.ausencia.findFirst({
		where: {
			id: params.id,
			colaboradorId: params.colaboradorId,
			empresaId: admin.empresaId,
			tipo: TIPO_FOLGA
		},
		select: { id: true }
	});
	if (!folga) return jsonError('Folga não encontrada', 404);

	await prisma.ausencia.delete({ where: { id: folga.id } });
	return new Response(null, { status: 204 });
};
