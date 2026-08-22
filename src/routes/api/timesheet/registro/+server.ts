import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '@/lib/server/db';
import { criarRegistro } from '@/lib/server/registro-ledger';
import { toRegistroDTO } from '@/lib/server/timesheet';
import { requireUser, jsonError, jsonOk } from '../../_lib/auth-helpers';

const VALID_TYPES = ['entrada', 'saida_almoco', 'retorno_almoco', 'saida'];

export const POST: RequestHandler = async ({ request }) => {
	let user;
	try {
		user = requireUser(request);
	} catch (response) {
		return response as Response;
	}

	// Só quem tem vínculo de colaborador bate ponto (o token carrega o colaboradorId).
	if (!user.colaboradorId) {
		return jsonError('Usuário sem vínculo de colaborador não registra ponto', 403);
	}

	let body: { type?: string };
	try {
		body = await request.json();
	} catch {
		return jsonError('Corpo da requisição inválido', 400);
	}

	if (!body.type || !VALID_TYPES.includes(body.type)) {
		return jsonError(`type deve ser um de: ${VALID_TYPES.join(', ')}`, 400);
	}

	const registro = await prisma.$transaction((tx) =>
		criarRegistro(tx, {
			colaboradorId: user.colaboradorId!,
			empresaId: user.empresaId,
			tipo: body.type!,
			metodo: 'manual'
		})
	);

	return jsonOk(toRegistroDTO(registro), 201);
};
