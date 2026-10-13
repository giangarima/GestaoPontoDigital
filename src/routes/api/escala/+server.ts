/**
 * @endpoint GET /api/escala?mes=AAAA-MM[&departamentoId=]
 * @description Grade da escala de folga do mês: colaborador × dia, com a origem
 * de cada decisão (ajuste, ciclo ou jornada), feriados, ausências aprovadas
 * (folga compensatória à parte, porque consome banco de horas) e os alertas
 * (repouso semanal, domingo no comércio, dia sem horário na jornada).
 * `bancoAtivo` diz se marcar folga pela grade desconta do banco.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '@/lib/server/db';
import { configDoBanco } from '@/lib/server/banco-horas/carregar';
import { cicloVigente, SEMANAS_SEM_DOMINGO } from '@/lib/server/escala/calendario';
import { escalasDosColaboradores } from '@/lib/server/escala/carregar';
import { montarLinhaGrade } from '@/lib/server/escala/grade';
import { feriadosDoPeriodo } from '@/lib/server/feriado/carregar';
import { somarDias } from '@/lib/server/feriado/calendario';
import { ausenciaNoPeriodo, diasDoMes } from '@/lib/server/periodo';
import { requireAdmin, jsonError, jsonOk } from '../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request, url }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const mes = url.searchParams.get('mes');
	if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
		return jsonError('mes é obrigatório no formato AAAA-MM', 400);
	}
	const departamentoId = url.searchParams.get('departamentoId') || undefined;
	const { inicio, fim } = diasDoMes(mes);
	// Os alertas olham para trás: dias e domingos seguidos vindos do mês anterior.
	const desde = somarDias(inicio, -7 * SEMANAS_SEM_DOMINGO);

	const colaboradores = await prisma.colaborador.findMany({
		where: { empresaId: admin.empresaId, deletedAt: null, departamentoId },
		orderBy: { usuario: { nome: 'asc' } },
		select: {
			id: true,
			cargo: true,
			usuario: { select: { nome: true } },
			departamento: { select: { id: true, nome: true } },
			jornada: { select: { versoes: { select: { vigenciaInicio: true, dias: true } } } }
		}
	});
	const ids = colaboradores.map((c) => c.id);
	const [escalas, feriados, ausencias, banco] = await Promise.all([
		escalasDosColaboradores(ids, desde, fim),
		feriadosDoPeriodo(admin.empresaId, desde, fim),
		prisma.ausencia.findMany({
			where: { colaboradorId: { in: ids }, status: 'aprovada', ...ausenciaNoPeriodo(desde, fim) },
			select: { id: true, colaboradorId: true, tipo: true, dataInicio: true, dataFim: true }
		}),
		configDoBanco(admin.empresaId)
	]);

	const linhas = colaboradores.map((c) => {
		const escala = escalas.get(c.id) ?? null;
		const { dias, alertas } = montarLinhaGrade(
			c.jornada?.versoes ?? [],
			escala,
			feriados,
			ausencias.filter((a) => a.colaboradorId === c.id),
			c.id,
			desde,
			fim,
			inicio
		);
		return {
			id: c.id,
			nome: c.usuario.nome,
			cargo: c.cargo,
			departamento: c.departamento,
			ciclo: escala ? (cicloVigente(escala.ciclos, fim)?.sequencia ?? null) : null,
			dias,
			alertas
		};
	});

	return jsonOk({
		mes,
		bancoAtivo: banco !== null,
		feriados: [...feriados]
			.filter(([dia]) => dia >= inicio)
			.map(([dia, f]) => ({ dia, nome: f.nome, tipo: f.tipo })),
		colaboradores: linhas
	});
};
