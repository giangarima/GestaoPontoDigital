import type { RequestHandler } from '@sveltejs/kit';
import { toEmpresaDTO } from '@/lib/server/empresa';
import { prisma } from '@/lib/server/db';
import { requireAdmin, jsonError, jsonOk } from '../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	// Admin vê apenas a própria empresa (multi-tenant: cada admin pertence a uma)
	const empresas = await prisma.empresa.findMany({
		where: { id: admin.empresaId },
		orderBy: { nome: 'asc' }
	});

	return jsonOk(empresas.map(toEmpresaDTO));
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	let body: Partial<{
		nome: string;
		cnpj: string;
		horaAbertura: string;
		horaFechamento: string;
	}>;

	try {
		body = await request.json();
	} catch {
		return jsonError('Corpo da requisição inválido', 400);
	}

	if (!body.nome || !body.horaAbertura || !body.horaFechamento) {
		return jsonError('nome, horaAbertura e horaFechamento são obrigatórios', 400);
	}

	const empresa = await prisma.empresa.create({
		data: {
			nome: body.nome,
			cnpj: body.cnpj ?? null,
			horaAbertura: body.horaAbertura,
			horaFechamento: body.horaFechamento
		}
	});

	return jsonOk(toEmpresaDTO(empresa), 201);
};
