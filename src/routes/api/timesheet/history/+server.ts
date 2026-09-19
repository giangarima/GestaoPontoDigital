import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '@/lib/server/db';
import { buildDailySummaries, ausenciaDateKeys } from '@/lib/server/timesheet';
import { ausenciaNoPeriodo, ehDia, instantesDoPeriodo } from '@/lib/server/periodo';
import { requireUser, jsonError, jsonOk } from '../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request, url }) => {
	let user;
	try {
		user = requireUser(request);
	} catch (response) {
		return response as Response;
	}

	const startDate = url.searchParams.get('startDate') ?? url.searchParams.get('start');
	const endDate = url.searchParams.get('endDate') ?? url.searchParams.get('end');

	if (!startDate || !endDate) {
		return jsonError('startDate e endDate são obrigatórios', 400);
	}

	if (!ehDia(startDate) || !ehDia(endDate)) {
		return jsonError('Datas inválidas', 400);
	}

	if (!user.colaboradorId) {
		// Usuário sem vínculo de colaborador (admin puro) não tem ponto.
		return jsonOk([]);
	}
	const colaboradorId = user.colaboradorId;

	const [registros, ausencias] = await Promise.all([
		prisma.registro.findMany({
			where: { colaboradorId, marcadoEm: instantesDoPeriodo(startDate, endDate) },
			orderBy: { marcadoEm: 'asc' },
			include: { anulacao: true }
		}),
		prisma.ausencia.findMany({
			where: {
				colaboradorId,
				status: 'aprovada',
				...ausenciaNoPeriodo(startDate, endDate)
			}
		})
	]);

	const datasAbonadas = ausenciaDateKeys(ausencias);
	return jsonOk(buildDailySummaries(registros, datasAbonadas));
};
