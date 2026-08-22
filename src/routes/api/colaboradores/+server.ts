import type { RequestHandler } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/server/db';
import { toColaboradorDTO, emailEmUso, cpfEmUso, mapPrismaError } from '@/lib/server/colaborador';
import { registrarEventoEmpregado } from '@/lib/server/registro-ledger';
import { colaboradorCreateSchema } from '@/lib/schemas/colaborador.schema';
import { encodeResetToken, buildResetUrl } from '@/lib/server/password-reset';
import { sendWelcomeEmail } from '@/lib/server/mailer';
import { requireAdmin, jsonError, jsonOk } from '../_lib/auth-helpers';

const SENHA_PADRAO = 'Senha123';

export const GET: RequestHandler = async ({ request }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const users = await prisma.colaborador.findMany({
		where: { empresaId: admin.empresaId, deletedAt: null },
		include: { departamento: true, usuario: { select: { nome: true, email: true, cpf: true } } },
		orderBy: { usuario: { nome: 'asc' } }
	});

	return jsonOk(users.map(toColaboradorDTO));
};

export const POST: RequestHandler = async ({ request }) => {
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

	const parsed = colaboradorCreateSchema.safeParse(body);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		return jsonError(issue.message, 400, String(issue.path[0] ?? ''));
	}
	const data = parsed.data;

	const departamento = await prisma.departamento.findUnique({
		where: { id: data.departamentoId }
	});
	if (!departamento || departamento.empresaId !== admin.empresaId) {
		return jsonError('Departamento inválido', 400, 'departamentoId');
	}

	if (data.jornadaId) {
		const jornada = await prisma.jornada.findUnique({ where: { id: data.jornadaId } });
		if (!jornada || jornada.empresaId !== admin.empresaId) {
			return jsonError('Jornada inválida', 400, 'jornadaId');
		}
	}

	if (await emailEmUso(data.email, admin.empresaId))
		return jsonError('E-mail já cadastrado', 409, 'email');
	if (await cpfEmUso(data.cpf, admin.empresaId)) return jsonError('CPF já cadastrado', 409, 'cpf');

	try {
		// Identidade (login) + extensão de vínculo criadas na mesma transação.
		const senhaHash = await bcrypt.hash(SENHA_PADRAO, 10);
		const colaborador = await prisma.$transaction(async (tx) => {
			const usuario = await tx.usuario.create({
				data: {
					empresaId: admin.empresaId,
					nome: data.nome,
					email: data.email,
					cpf: data.cpf,
					senhaHash,
					role: 'colaborador'
				}
			});
			const colab = await tx.colaborador.create({
				data: {
					usuarioId: usuario.id,
					empresaId: admin.empresaId,
					cargo: data.cargo,
					departamentoId: data.departamentoId,
					telefone: data.telefone || null,
					dataAdmissao: new Date(data.dataAdmissao),
					status: data.status,
					jornadaId: data.jornadaId
				},
				include: {
					departamento: true,
					usuario: { select: { nome: true, email: true, cpf: true, senhaHash: true } }
				}
			});
			// AFD tipo 5: evento de inclusão de empregado na cadeia de NSR.
			await registrarEventoEmpregado(tx, {
				empresaId: admin.empresaId,
				operacao: 'I',
				cpfEmpregado: data.cpf,
				nomeEmpregado: data.nome,
				cpfResponsavel: admin.cpf,
				colaboradorId: colab.id
			});
			return colab;
		});

		// E-mail de boas-vindas com link para o colaborador definir a própria senha.
		// Token de onboarding com validade maior (3 dias). Falha de envio não
		// impede o cadastro — a senha padrão continua valendo como fallback.
		try {
			const token = encodeResetToken(
				{
					id: colaborador.usuarioId,
					role: 'colaborador',
					senhaHash: colaborador.usuario.senhaHash
				},
				'3d'
			);
			await sendWelcomeEmail(
				colaborador.usuario.email,
				colaborador.usuario.nome,
				buildResetUrl(token)
			);
		} catch (e) {
			console.error('Erro ao enviar e-mail de boas-vindas:', e);
		}

		return jsonOk(toColaboradorDTO(colaborador), 201);
	} catch (e) {
		return mapPrismaError(e);
	}
};
