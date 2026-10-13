/**
 * @endpoint PUT /api/escala/ajuste
 * @description Exceção da escala num dia: `{ colaboradorId, data, trabalha, motivo }`.
 * `trabalha: null` remove o ajuste (o dia volta ao ciclo/jornada). Trocar uma
 * folga de dia são dois ajustes.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '@/lib/server/db';
import { dataPura, ehDia } from '@/lib/server/periodo';
import { requireAdmin, jsonError, jsonOk } from '../../_lib/auth-helpers';

export const PUT: RequestHandler = async ({ request }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	let body: { colaboradorId?: string; data?: string; trabalha?: boolean | null; motivo?: string };
	try {
		body = await request.json();
	} catch {
		return jsonError('Corpo da requisição inválido', 400);
	}

	if (!body.colaboradorId || !ehDia(body.data)) {
		return jsonError('colaboradorId e data (AAAA-MM-dd) são obrigatórios', 400);
	}
	if (body.trabalha !== null && typeof body.trabalha !== 'boolean') {
		return jsonError('trabalha deve ser true, false ou null', 400);
	}
	const colaborador = await prisma.colaborador.findFirst({
		where: { id: body.colaboradorId, empresaId: admin.empresaId },
		select: { id: true }
	});
	if (!colaborador) return jsonError('Colaborador não encontrado', 404);

	const chave = { colaboradorId: colaborador.id, data: dataPura(body.data) };
	if (body.trabalha === null) {
		await prisma.escalaAjuste.deleteMany({ where: chave });
		return jsonOk({ ...body, trabalha: null });
	}

	const motivo = body.motivo?.trim() || null;
	await prisma.escalaAjuste.upsert({
		where: { colaboradorId_data: chave },
		create: { ...chave, trabalha: body.trabalha, motivo, criadoPor: admin.id },
		update: { trabalha: body.trabalha, motivo, criadoPor: admin.id }
	});
	return jsonOk({
		colaboradorId: colaborador.id,
		data: body.data,
		trabalha: body.trabalha,
		motivo
	});
};
