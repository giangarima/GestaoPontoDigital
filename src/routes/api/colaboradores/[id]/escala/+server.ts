/**
 * @endpoint GET/PUT /api/colaboradores/:id/escala
 * @description Ciclo da escala de folga do colaborador, versionado por vigência
 * (como a jornada). GET devolve as versões; PUT grava uma versão nova
 * `{ vigenciaInicio: 'AAAA-MM-dd', sequencia: 'TTTTTTF' | null }` — `null` volta ao
 * padrão semanal da jornada a partir da data. Mesma data = substitui a versão.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '@/lib/server/db';
import { sequenciaValida } from '@/lib/server/escala/calendario';
import { dataPura, diaDaDataPura, ehDia } from '@/lib/server/periodo';
import { requireAdmin, jsonError, jsonOk } from '../../../_lib/auth-helpers';

async function doColaborador(id: string, empresaId: string) {
	return prisma.colaborador.findFirst({ where: { id, empresaId }, select: { id: true } });
}

function toDTO(c: { vigenciaInicio: Date; sequencia: string | null }) {
	return { vigenciaInicio: diaDaDataPura(c.vigenciaInicio), sequencia: c.sequencia };
}

export const GET: RequestHandler = async ({ request, params }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}
	if (!(await doColaborador(params.id!, admin.empresaId))) {
		return jsonError('Colaborador não encontrado', 404);
	}

	const ciclos = await prisma.escalaCiclo.findMany({
		where: { colaboradorId: params.id },
		orderBy: { vigenciaInicio: 'asc' }
	});
	return jsonOk(ciclos.map(toDTO));
};

export const PUT: RequestHandler = async ({ request, params }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	let body: { vigenciaInicio?: string; sequencia?: string | null };
	try {
		body = await request.json();
	} catch {
		return jsonError('Corpo da requisição inválido', 400);
	}

	if (!ehDia(body.vigenciaInicio)) {
		return jsonError('vigenciaInicio (AAAA-MM-dd) é obrigatória', 400);
	}
	const sequencia = body.sequencia ? body.sequencia.trim().toUpperCase() : null;
	if (sequencia !== null && !sequenciaValida(sequencia)) {
		return jsonError(
			'sequencia deve ter só T (trabalho) e F (folga), de 2 a 28 dias, com ao menos um de cada',
			400
		);
	}
	if (!(await doColaborador(params.id!, admin.empresaId))) {
		return jsonError('Colaborador não encontrado', 404);
	}

	const vigenciaInicio = dataPura(body.vigenciaInicio);
	const ciclo = await prisma.escalaCiclo.upsert({
		where: { colaboradorId_vigenciaInicio: { colaboradorId: params.id!, vigenciaInicio } },
		create: { colaboradorId: params.id!, vigenciaInicio, sequencia },
		update: { sequencia }
	});
	return jsonOk(toDTO(ciclo));
};
