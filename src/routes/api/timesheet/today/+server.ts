import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '@/lib/server/db';
import { buildSummary } from '@/lib/server/timesheet';
import { ausenciaNoPeriodo, diaDe, instantesDoPeriodo } from '@/lib/server/periodo';
import { requireUser, jsonOk } from '../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request }) => {
	let user;
	try {
		user = requireUser(request);
	} catch (response) {
		return response as Response;
	}

	const hoje = diaDe(new Date());
	if (!user.colaboradorId) {
		// Usuário sem vínculo de colaborador (admin puro) não tem ponto.
		return jsonOk(buildSummary(hoje, [], false));
	}
	const colaboradorId = user.colaboradorId;

	const [registros, ausencias] = await Promise.all([
		prisma.registro.findMany({
			where: { colaboradorId, marcadoEm: instantesDoPeriodo(hoje, hoje) },
			orderBy: { marcadoEm: 'asc' },
			include: { anulacao: true }
		}),
		// Ausência aprovada que cobre o dia.
		prisma.ausencia.findMany({
			where: { colaboradorId, status: 'aprovada', ...ausenciaNoPeriodo(hoje, hoje) }
		})
	]);

	const abonado = ausencias.length > 0;
	return jsonOk(buildSummary(hoje, registros, abonado));
};
