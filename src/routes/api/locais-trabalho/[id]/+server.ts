/**
 * @endpoint PUT/DELETE /api/locais-trabalho/:id
 * @description Edita ou remove um local de trabalho. Mudar o ponto ou o raio não
 * reavalia batidas antigas — a conferência é um snapshot da marcação. Local com
 * batidas vinculadas não é apagado, só desativado, para o histórico continuar
 * dizendo onde foi a marcação.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '@/lib/server/db';
import { LOCAL_SELECT, lerLocalTrabalho } from '@/lib/server/geolocalizacao';
import { requireAdmin, jsonError, jsonOk } from '../../_lib/auth-helpers';

async function doAdmin(id: string, empresaId: string) {
	const local = await prisma.localTrabalho.findUnique({
		where: { id },
		select: { empresaId: true }
	});
	return local?.empresaId === empresaId;
}

export const PUT: RequestHandler = async ({ request, params }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}
	if (!(await doAdmin(params.id!, admin.empresaId))) {
		return jsonError('Local não encontrado', 404);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonError('Corpo da requisição inválido', 400);
	}

	const lido = lerLocalTrabalho(body);
	if (!lido.ok) return jsonError(lido.erro, 400);

	const local = await prisma.localTrabalho.update({
		where: { id: params.id },
		data: lido.local,
		select: LOCAL_SELECT
	});
	return jsonOk(local);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}
	if (!(await doAdmin(params.id!, admin.empresaId))) {
		return jsonError('Local não encontrado', 404);
	}

	const usado = await prisma.registro.count({ where: { localTrabalhoId: params.id } });
	if (usado > 0) {
		const local = await prisma.localTrabalho.update({
			where: { id: params.id },
			data: { ativo: false },
			select: LOCAL_SELECT
		});
		return jsonOk(local);
	}

	await prisma.localTrabalho.delete({ where: { id: params.id } });
	return new Response(null, { status: 204 });
};
