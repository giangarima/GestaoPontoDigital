/**
 * @endpoint GET /api/timesheet/comprovantes
 * @description Comprovantes das marcações originais (fonte "O") das últimas 48
 * horas (Portaria 671/2021, art. 80, parágrafo único, III). Sem parâmetro, lista
 * os do próprio usuário com vínculo de colaborador; admin pode passar
 * `colaboradorId` de alguém da empresa.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '@/lib/server/db';
import { formatNsr } from '@/lib/server/nsr';
import { requireUser, jsonOk, jsonError } from '../../_lib/auth-helpers';

const JANELA_MS = 48 * 3600 * 1000;

export const GET: RequestHandler = async ({ request, url }) => {
	let user;
	try {
		user = requireUser(request);
	} catch (response) {
		return response as Response;
	}

	const pedido = url.searchParams.get('colaboradorId');
	const colaboradorId = pedido ?? user.colaboradorId;
	if (!colaboradorId) return jsonError('colaboradorId é obrigatório', 400);
	if (pedido && pedido !== user.colaboradorId && user.role !== 'admin') {
		return jsonError('Acesso negado', 403);
	}

	const registros = await prisma.registro.findMany({
		where: {
			empresaId: user.empresaId,
			colaboradorId,
			fonte: 'O',
			marcadoEm: { gte: new Date(Date.now() - JANELA_MS) }
		},
		orderBy: { marcadoEm: 'desc' },
		select: {
			id: true,
			tipo: true,
			nsr: true,
			marcadoEm: true,
			comprovante: { select: { envioStatus: true, enviadoEm: true } }
		}
	});

	return jsonOk(
		registros.map((r) => ({
			registroId: r.id,
			tipo: r.tipo,
			nsr: formatNsr(r.nsr!),
			marcadoEm: r.marcadoEm.toISOString(),
			envioStatus: r.comprovante?.envioStatus ?? null,
			enviadoEm: r.comprovante?.enviadoEm?.toISOString() ?? null,
			downloadUrl: `/api/timesheet/comprovantes/${r.id}`
		}))
	);
};
