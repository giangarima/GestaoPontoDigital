/**
 * @endpoint PUT /api/feriados/escala
 * @description Define quem trabalha num feriado ou ponto facultativo — a empresa
 * pode abrir com equipe reduzida. Corpo: `{ data: 'AAAA-MM-dd', colaboradorIds: string[] }`.
 * Lista vazia = empresa fechada no dia.
 *
 * Feriado nacional não tem linha até a empresa abrir nele: a primeira escala cria
 * a linha (só para guardar a escala) e a escala vazia a remove.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '@/lib/server/db';
import { feriadosNacionais } from '@/lib/server/feriado/calendario';
import { dataPura, ehDia } from '@/lib/server/periodo';
import { requireAdmin, jsonError, jsonOk } from '../../_lib/auth-helpers';

export const PUT: RequestHandler = async ({ request }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	let body: { data?: string; colaboradorIds?: unknown };
	try {
		body = await request.json();
	} catch {
		return jsonError('Corpo da requisição inválido', 400);
	}

	if (!ehDia(body.data)) return jsonError('data (AAAA-MM-dd) é obrigatória', 400);
	if (
		!Array.isArray(body.colaboradorIds) ||
		body.colaboradorIds.some((id) => typeof id !== 'string')
	) {
		return jsonError('colaboradorIds deve ser uma lista de ids', 400);
	}
	const dia = body.data;
	const ids = [...new Set(body.colaboradorIds as string[])];

	// Só colaboradores da própria empresa entram na escala.
	const validos = await prisma.colaborador.count({
		where: { id: { in: ids }, empresaId: admin.empresaId }
	});
	if (validos !== ids.length) return jsonError('Colaborador não encontrado', 404);

	const nacional = feriadosNacionais(Number(dia.slice(0, 4))).get(dia);
	const chave = { empresaId_data: { empresaId: admin.empresaId, data: dataPura(dia) } };

	const escalados = await prisma.$transaction(async (tx) => {
		let feriado = await tx.feriado.findUnique({ where: chave });
		if (!feriado && !nacional) return null;

		if (nacional && ids.length === 0) {
			// Nacional sem escala volta a ser só o da lei.
			if (feriado) await tx.feriado.delete({ where: { id: feriado.id } });
			return [];
		}
		feriado ??= await tx.feriado.create({
			data: {
				empresaId: admin.empresaId,
				data: dataPura(dia),
				nome: nacional!,
				tipo: 'feriado',
				abrangencia: 'nacional'
			}
		});
		await tx.feriadoEscala.deleteMany({ where: { feriadoId: feriado.id } });
		await tx.feriadoEscala.createMany({
			data: ids.map((colaboradorId) => ({ feriadoId: feriado.id, colaboradorId }))
		});
		return ids;
	});

	if (escalados === null) return jsonError('Não há feriado cadastrado nessa data', 404);
	return jsonOk({ data: dia, escalados });
};
