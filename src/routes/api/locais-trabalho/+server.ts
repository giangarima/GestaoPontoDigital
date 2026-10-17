/**
 * @endpoint GET/POST /api/locais-trabalho
 * @description Locais de trabalho da empresa para a conferência da geolocalização
 * da batida (`src/lib/server/geolocalizacao.ts`). GET lista todos, ativos e
 * inativos; POST cadastra um local (nome, ponto e raio em metros).
 */
import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '@/lib/server/db';
import { LOCAL_SELECT, lerLocalTrabalho } from '@/lib/server/geolocalizacao';
import { requireAdmin, jsonError, jsonOk } from '../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const locais = await prisma.localTrabalho.findMany({
		where: { empresaId: admin.empresaId },
		orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
		select: LOCAL_SELECT
	});
	return jsonOk(locais);
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

	const lido = lerLocalTrabalho(body);
	if (!lido.ok) return jsonError(lido.erro, 400);

	const local = await prisma.localTrabalho.create({
		data: { empresaId: admin.empresaId, ...lido.local },
		select: LOCAL_SELECT
	});
	return jsonOk(local, 201);
};
