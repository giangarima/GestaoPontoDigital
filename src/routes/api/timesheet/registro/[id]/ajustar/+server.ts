/**
 * @endpoint POST /api/timesheet/registro/[id]/ajustar
 * @description Admin corrige uma batida existente da própria empresa.
 *
 * Conformidade Portaria 671/2021: a batida original NÃO é alterada nem removida.
 * Em uma única transação:
 *  - cria uma nova batida corrigida (`method: 'manual'`, imutável);
 *  - cria um RegistroAnulacao que invalida a original e aponta para a corrigida
 *    via `registroSubstitutoId`, preservando a trilha "antes → depois".
 */
import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '@/lib/server/db';
import { criarRegistro } from '@/lib/server/registro-ledger';
import { toRegistroDTO } from '@/lib/server/timesheet';
import { requireAdmin, jsonError, jsonOk } from '../../../../_lib/auth-helpers';

const VALID_TYPES = ['entrada', 'saida_almoco', 'retorno_almoco', 'saida'];

export const POST: RequestHandler = async ({ request, params }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const registroId = params.id;
	if (!registroId) return jsonError('id é obrigatório', 400);

	let body: { type?: string; timestamp?: string; reason?: string };
	try {
		body = await request.json();
	} catch {
		return jsonError('Corpo da requisição inválido', 400);
	}

	if (!body.timestamp) return jsonError('timestamp é obrigatório', 400);
	const ts = new Date(body.timestamp);
	if (isNaN(ts.getTime())) return jsonError('timestamp inválido', 400);
	if (ts.getTime() > Date.now()) {
		return jsonError('Não é permitido registrar batida no futuro', 400);
	}
	if (!body.reason || body.reason.trim().length < 5) {
		return jsonError('Motivo é obrigatório (mínimo 5 caracteres)', 400);
	}

	const registro = await prisma.registro.findUnique({
		where: { id: registroId },
		include: { anulacao: true }
	});

	if (!registro || registro.empresaId !== admin.empresaId) {
		return jsonError('Batida não encontrada', 404);
	}
	if (registro.anulacao) {
		return jsonError('Batida já anulada', 409);
	}

	const tipo = body.type ?? registro.tipo;
	if (!VALID_TYPES.includes(tipo)) {
		return jsonError(`type deve ser um de: ${VALID_TYPES.join(', ')}`, 400);
	}

	const motivo = body.reason.trim();

	const corrigido = await prisma.$transaction(async (tx) => {
		const novo = await criarRegistro(tx, {
			colaboradorId: registro.colaboradorId,
			empresaId: admin.empresaId,
			tipo,
			marcadoEm: ts,
			metodo: 'manual',
			criadoPor: admin.id,
			criadoMotivo: motivo
		});

		await tx.registroAnulacao.create({
			data: {
				registroId: registro.id,
				registroSubstitutoId: novo.id,
				empresaId: admin.empresaId,
				motivo,
				anuladoPor: admin.id
			}
		});

		return novo;
	});

	return jsonOk(toRegistroDTO(corrigido), 201);
};
