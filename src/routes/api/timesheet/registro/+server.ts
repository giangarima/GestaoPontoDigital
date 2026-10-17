import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '@/lib/server/db';
import { criarRegistro } from '@/lib/server/registro-ledger';
import { emitirComprovante } from '@/lib/server/comprovante/emitir';
import { toRegistroDTO } from '@/lib/server/timesheet';
import { avaliarPosicao, validarPosicao } from '@/lib/server/geolocalizacao';
import { requireUser, jsonError, jsonOk } from '../../_lib/auth-helpers';

const VALID_TYPES = ['entrada', 'saida_almoco', 'retorno_almoco', 'saida'];

export const POST: RequestHandler = async ({ request }) => {
	let user;
	try {
		user = requireUser(request);
	} catch (response) {
		return response as Response;
	}

	if (!user.colaboradorId) {
		return jsonError('Usuário sem vínculo de colaborador não registra ponto', 403);
	}

	let body: { type?: string; posicao?: unknown };
	try {
		body = await request.json();
	} catch {
		return jsonError('Corpo da requisição inválido', 400);
	}

	if (!body.type || !VALID_TYPES.includes(body.type)) {
		return jsonError(`type deve ser um de: ${VALID_TYPES.join(', ')}`, 400);
	}

	// A posição só sinaliza: ausente ou inválida, a batida entra "sem localização".
	const locais = await prisma.localTrabalho.findMany({
		where: { empresaId: user.empresaId, ativo: true },
		select: { id: true, latitude: true, longitude: true, raioM: true, nome: true }
	});
	const geo = avaliarPosicao(validarPosicao(body.posicao), locais);

	const registro = await prisma.$transaction((tx) =>
		criarRegistro(tx, {
			colaboradorId: user.colaboradorId!,
			empresaId: user.empresaId,
			cpf: user.cpf,
			tipo: body.type!,
			metodo: 'manual',
			geo
		})
	);

	void emitirComprovante(registro.id);

	const localTrabalho = locais.find((l) => l.id === geo.localTrabalhoId) ?? null;
	return jsonOk(toRegistroDTO({ ...registro, localTrabalho }), 201);
};
