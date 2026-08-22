import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '@/lib/server/db';
import { toColaboradorDTO, emailEmUso, cpfEmUso, mapPrismaError } from '@/lib/server/colaborador';
import { registrarEventoEmpregado } from '@/lib/server/registro-ledger';
import { colaboradorUpdateSchema } from '@/lib/schemas/colaborador.schema';
import { requireAdmin, jsonError, jsonOk } from '../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request, params }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const user = await prisma.colaborador.findFirst({
		where: { id: params.id, deletedAt: null },
		include: { departamento: true, usuario: { select: { nome: true, email: true, cpf: true } } }
	});
	if (!user || user.empresaId !== admin.empresaId) {
		return jsonError('Colaborador não encontrado', 404);
	}

	return jsonOk(toColaboradorDTO(user));
};

export const PUT: RequestHandler = async ({ request, params }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonError('Corpo da requisição inválido', 400);
	}

	const parsed = colaboradorUpdateSchema.safeParse(body);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		return jsonError(issue.message, 400, String(issue.path[0] ?? ''));
	}
	const data = parsed.data;

	const existing = await prisma.colaborador.findFirst({
		where: { id: params.id, deletedAt: null }
	});
	if (!existing || existing.empresaId !== admin.empresaId) {
		return jsonError('Colaborador não encontrado', 404);
	}

	if (data.departamentoId !== undefined) {
		const departamento = await prisma.departamento.findUnique({
			where: { id: data.departamentoId }
		});
		if (!departamento || departamento.empresaId !== admin.empresaId) {
			return jsonError('Departamento inválido', 400, 'departamentoId');
		}
	}

	if (data.jornadaId) {
		const jornada = await prisma.jornada.findUnique({ where: { id: data.jornadaId } });
		if (!jornada || jornada.empresaId !== admin.empresaId) {
			return jsonError('Jornada inválida', 400, 'jornadaId');
		}
	}

	if (
		data.email !== undefined &&
		(await emailEmUso(data.email, admin.empresaId, existing.usuarioId))
	) {
		return jsonError('E-mail já cadastrado', 409, 'email');
	}
	if (data.cpf !== undefined && (await cpfEmUso(data.cpf, admin.empresaId, existing.usuarioId))) {
		return jsonError('CPF já cadastrado', 409, 'cpf');
	}

	try {
		// Nome/e-mail/CPF vivem na identidade; o resto na extensão. Atualiza ambos
		// na mesma transação.
		const user = await prisma.$transaction(async (tx) => {
			if (data.nome !== undefined || data.email !== undefined || data.cpf !== undefined) {
				await tx.usuario.update({
					where: { id: existing.usuarioId },
					data: { nome: data.nome, email: data.email, cpf: data.cpf }
				});
			}
			const colab = await tx.colaborador.update({
				where: { id: params.id },
				data: {
					cargo: data.cargo,
					departamentoId: data.departamentoId,
					telefone: data.telefone === undefined ? undefined : data.telefone || null,
					dataAdmissao: data.dataAdmissao === undefined ? undefined : new Date(data.dataAdmissao),
					status: data.status,
					jornadaId: data.jornadaId
				},
				include: {
					departamento: true,
					usuario: { select: { nome: true, email: true, cpf: true } }
				}
			});
			// AFD tipo 5: evento de alteração de empregado na cadeia de NSR.
			await registrarEventoEmpregado(tx, {
				empresaId: admin.empresaId,
				operacao: 'A',
				cpfEmpregado: colab.usuario.cpf,
				nomeEmpregado: colab.usuario.nome,
				cpfResponsavel: admin.cpf,
				colaboradorId: colab.id
			});
			return colab;
		});

		return jsonOk(toColaboradorDTO(user));
	} catch (e) {
		return mapPrismaError(e);
	}
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const existing = await prisma.colaborador.findUnique({
		where: { id: params.id },
		include: { usuario: { select: { nome: true, cpf: true } } }
	});
	if (!existing || existing.empresaId !== admin.empresaId || existing.deletedAt) {
		return jsonError('Colaborador não encontrado', 404);
	}

	// Soft delete — Portaria 671/2021: preserva o histórico de ponto (Registro).
	// AFD tipo 5: registra o evento de exclusão do empregado na cadeia de NSR.
	await prisma.$transaction(async (tx) => {
		await tx.colaborador.update({
			where: { id: params.id },
			data: { deletedAt: new Date(), status: 'inativo' }
		});
		await registrarEventoEmpregado(tx, {
			empresaId: admin.empresaId,
			operacao: 'E',
			cpfEmpregado: existing.usuario.cpf,
			nomeEmpregado: existing.usuario.nome,
			cpfResponsavel: admin.cpf,
			colaboradorId: existing.id
		});
	});
	return new Response(null, { status: 204 });
};
