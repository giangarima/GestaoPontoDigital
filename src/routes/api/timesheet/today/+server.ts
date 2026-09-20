import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '@/lib/server/db';
import { buildSummary } from '@/lib/server/timesheet';
import { ausenciaNoPeriodo, diaDe, instantesDoPeriodo } from '@/lib/server/periodo';
import { contratualPorDia, previstasPorDia } from '@/lib/server/jornada';
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
		return jsonOk(buildSummary(hoje, [], { contratualMin: () => null }));
	}
	const colaboradorId = user.colaboradorId;

	const [registros, ausencias, colaborador] = await Promise.all([
		prisma.registro.findMany({
			where: { colaboradorId, marcadoEm: instantesDoPeriodo(hoje, hoje) },
			orderBy: { marcadoEm: 'asc' },
			include: { anulacao: true }
		}),
		// Ausência aprovada que cobre o dia.
		prisma.ausencia.findMany({
			where: { colaboradorId, status: 'aprovada', ...ausenciaNoPeriodo(hoje, hoje) }
		}),
		prisma.colaborador.findUnique({
			where: { id: colaboradorId },
			select: { jornada: { select: { versoes: true } } }
		})
	]);

	return jsonOk(
		buildSummary(hoje, registros, {
			hoje,
			datasAbonadas: ausencias.length > 0 ? new Set([hoje]) : new Set(),
			contratualMin: contratualPorDia(colaborador?.jornada?.versoes),
			previstas: previstasPorDia(colaborador?.jornada?.versoes)
		})
	);
};
