import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '@/lib/server/db';
import { buildDailySummaries, ausenciaDateKeys } from '@/lib/server/timesheet';
import { calcularHorasEsperadasMes } from '@/lib/server/jornada';
import { ausenciaNoPeriodo, diasDoMes, instantesDoPeriodo } from '@/lib/server/periodo';
import { requireAdmin, jsonError, jsonOk } from '../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request, url }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const mes = url.searchParams.get('mes'); // "YYYY-MM"
	if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
		return jsonError('mes é obrigatório no formato YYYY-MM', 400);
	}

	const [ano, mesNum] = mes.split('-').map(Number);
	const periodo = diasDoMes(mes);

	const colaboradores = await prisma.colaborador.findMany({
		// MVP: consolidado do mês lista apenas colaboradores ativos.
		where: { empresaId: admin.empresaId, deletedAt: null },
		orderBy: { usuario: { nome: 'asc' } },
		include: { jornada: { include: { versoes: true } }, usuario: { select: { nome: true } } }
	});

	const registros = await prisma.registro.findMany({
		where: {
			empresaId: admin.empresaId,
			marcadoEm: instantesDoPeriodo(periodo.inicio, periodo.fim)
		},
		orderBy: { marcadoEm: 'asc' }
	});

	// Ausências que tocam o mês (qualquer status). Aprovadas abonam o dia; a
	// contagem por tipo alimenta os totais de férias e faltas justificadas.
	const ausenciasMes = await prisma.ausencia.findMany({
		where: {
			empresaId: admin.empresaId,
			...ausenciaNoPeriodo(periodo.inicio, periodo.fim)
		}
	});

	const byUser = new Map<string, typeof registros>();
	for (const p of registros) {
		const list = byUser.get(p.colaboradorId) ?? [];
		list.push(p);
		byUser.set(p.colaboradorId, list);
	}

	const linhas = colaboradores.map((c) => {
		const ausenciasColab = ausenciasMes.filter((a) => a.colaboradorId === c.id);
		const datasAbonadas = ausenciaDateKeys(ausenciasColab.filter((a) => a.status === 'aprovada'));
		const dias = buildDailySummaries(byUser.get(c.id) ?? [], datasAbonadas);
		const horas = dias.reduce((acc, d) => acc + d.totalHours, 0);
		const extras = dias.reduce((acc, d) => acc + d.overtime, 0);
		const deficit = dias.reduce((acc, d) => acc + d.deficit, 0);
		const ferias = ausenciasColab.filter((a) => a.tipo === 'ferias').length;
		const faltasJustificadas = ausenciasColab.filter((a) => a.tipo !== 'ferias').length;
		const horasEsperadas = c.jornada
			? calcularHorasEsperadasMes(c.jornada.versoes, ano, mesNum)
			: 0;

		return {
			colaboradorId: c.id,
			colaboradorNome: c.usuario.nome,
			diasTrabalhados: dias.filter((d) => d.totalHours > 0).length,
			horas: Number(horas.toFixed(2)),
			horasEsperadas: Number(horasEsperadas.toFixed(2)),
			extras: Number(extras.toFixed(2)),
			deficit: Number(deficit.toFixed(2)),
			periodosFerias: ferias,
			faltasJustificadas
		};
	});

	return jsonOk({ mes, linhas });
};
