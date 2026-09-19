import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '@/lib/server/db';
import { buildDailySummaries, ausenciaDateKeys } from '@/lib/server/timesheet';
import { ausenciaNoPeriodo, ehDia, instantesDoPeriodo } from '@/lib/server/periodo';
import { requireAdmin, jsonError, jsonOk } from '../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request, url }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const colaboradorId = url.searchParams.get('colaboradorId');
	const inicio = url.searchParams.get('inicio');
	const fim = url.searchParams.get('fim');

	if (!colaboradorId || !inicio || !fim) {
		return jsonError('colaboradorId, inicio e fim são obrigatórios', 400);
	}

	const colaborador = await prisma.colaborador.findUnique({
		where: { id: colaboradorId },
		include: { usuario: { select: { nome: true } } }
	});
	if (!colaborador || colaborador.empresaId !== admin.empresaId) {
		return jsonError('Colaborador não encontrado', 404);
	}

	if (!ehDia(inicio) || !ehDia(fim)) {
		return jsonError('Datas inválidas', 400);
	}

	const [registros, ausencias] = await Promise.all([
		prisma.registro.findMany({
			where: { colaboradorId, marcadoEm: instantesDoPeriodo(inicio, fim) },
			orderBy: { marcadoEm: 'asc' },
			include: { anulacao: true }
		}),
		prisma.ausencia.findMany({
			where: {
				colaboradorId,
				empresaId: admin.empresaId,
				status: 'aprovada',
				...ausenciaNoPeriodo(inicio, fim)
			}
		})
	]);

	const datasAbonadas = ausenciaDateKeys(ausencias);

	// Estado efetivo (com ajustes do admin) e estado original (só marcações do
	// colaborador, fonte "O") — ambos a partir dos mesmos registros.
	const diasEfetivos = buildDailySummaries(registros, datasAbonadas);
	const diasOriginais = buildDailySummaries(registros, datasAbonadas, (p) => p.fonte === 'O');
	const origPorData = new Map(diasOriginais.map((d) => [d.date, d]));

	const dias = diasEfetivos.map((d) => {
		const o = origPorData.get(d.date);
		return {
			...d,
			original: {
				totalHours: o?.totalHours ?? 0,
				overtime: o?.overtime ?? 0,
				deficit: o?.deficit ?? 0
			}
		};
	});

	const somar = (lista: { totalHours: number; overtime: number; deficit: number }[]) => ({
		horas: Number(lista.reduce((acc, d) => acc + d.totalHours, 0).toFixed(2)),
		extras: Number(lista.reduce((acc, d) => acc + d.overtime, 0).toFixed(2)),
		deficit: Number(lista.reduce((acc, d) => acc + d.deficit, 0).toFixed(2))
	});

	return jsonOk({
		colaborador: { id: colaborador.id, nome: colaborador.usuario.nome },
		inicio,
		fim,
		dias,
		totais: {
			...somar(diasEfetivos),
			original: somar(diasOriginais)
		}
	});
};
