import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '@/lib/server/db';
import { buildDailySummaries } from '@/lib/server/timesheet';
import { versaoVigenteEm } from '@/lib/server/jornada';
import {
	ausenciaNoPeriodo,
	dataPura,
	diaDe,
	diasDoMes,
	ehDia,
	instantesDoPeriodo,
	minutosDoDia
} from '@/lib/server/periodo';
import { requireAdmin, jsonOk } from '../../_lib/auth-helpers';

const DIAS_KEYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'] as const;
type DiaKey = (typeof DIAS_KEYS)[number];

interface DiaJornada {
	ativo: boolean;
	entrada: string;
	saida_almoco: string;
	retorno_almoco: string;
	saida: string;
}
type JornadaDias = Record<DiaKey, DiaJornada>;

const TOLERANCIA_ATRASO_MIN = 10;

/** Dia da semana de um dia de calendário (AAAA-MM-dd). */
function diaKeyFromDia(dia: string): DiaKey {
	return DIAS_KEYS[dataPura(dia).getUTCDay()];
}

function timeStringToMinutes(time: string): number | null {
	const m = /^(\d{2}):(\d{2})$/.exec(time);
	if (!m) return null;
	return Number(m[1]) * 60 + Number(m[2]);
}

export const GET: RequestHandler = async ({ request, url }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const empresaId = admin.empresaId;

	// Permite escolher uma data específica para inspecionar (?data=YYYY-MM-DD).
	// Dias sempre no fuso de Brasília (ver periodo.ts).
	const dataParam = url.searchParams.get('data');
	const refKey = ehDia(dataParam) ? dataParam : diaDe(new Date());
	const refDia = instantesDoPeriodo(refKey, refKey);

	// ── KPIs simples ───────────────────────────────────────────────────────────
	const [totalColaboradores, colaboradoresAtivos] = await Promise.all([
		prisma.colaborador.count({ where: { empresaId, deletedAt: null } }),
		prisma.colaborador.count({ where: { status: 'ativo', empresaId, deletedAt: null } })
	]);

	const pontosHoje = await prisma.registro.count({
		where: { empresaId, marcadoEm: refDia }
	});

	// ── Janela do mês de referência ────────────────────────────────────────────
	const mes = diasDoMes(refKey.slice(0, 7));

	const registrosMes = await prisma.registro.findMany({
		where: { empresaId, marcadoEm: instantesDoPeriodo(mes.inicio, mes.fim) },
		orderBy: { marcadoEm: 'asc' }
	});

	// Index por usuário
	const registrosPorColaborador = new Map<string, typeof registrosMes>();
	for (const p of registrosMes) {
		const list = registrosPorColaborador.get(p.colaboradorId) ?? [];
		list.push(p);
		registrosPorColaborador.set(p.colaboradorId, list);
	}

	// Soma horas extras / déficit por dia (todos os colaboradores) e por colaborador
	const extrasPorDia = new Map<string, number>();
	const extrasPorUser = new Map<string, number>();
	const deficitPorUser = new Map<string, number>();

	for (const [userId, list] of registrosPorColaborador.entries()) {
		const sumarios = buildDailySummaries(list);
		let extrasUser = 0;
		let deficitUser = 0;
		for (const s of sumarios) {
			extrasPorDia.set(s.date, (extrasPorDia.get(s.date) ?? 0) + s.overtime);
			extrasUser += s.overtime;
			deficitUser += s.deficit;
		}
		extrasPorUser.set(userId, extrasUser);
		deficitPorUser.set(userId, deficitUser);
	}

	const horasExtrasMes = Array.from(extrasPorUser.values()).reduce((a, b) => a + b, 0);
	const horasDeficitMes = Array.from(deficitPorUser.values()).reduce((a, b) => a + b, 0);

	// Série diária: lista de todos os dias do mês (preenche 0 onde não há dado)
	const horasExtrasPorDia: { date: string; horas: number }[] = [];
	const ultimoDiaMes = Number(mes.fim.slice(8, 10));
	for (let d = 1; d <= ultimoDiaMes; d++) {
		const iso = `${refKey.slice(0, 7)}-${String(d).padStart(2, '0')}`;
		horasExtrasPorDia.push({
			date: iso,
			horas: Number((extrasPorDia.get(iso) ?? 0).toFixed(2))
		});
	}

	// ── Top 5 horas extras no mês ──────────────────────────────────────────────
	const colaboradores = await prisma.colaborador.findMany({
		where: { empresaId, deletedAt: null },
		select: {
			id: true,
			usuario: { select: { nome: true } },
			status: true,
			jornada: { select: { versoes: { select: { vigenciaInicio: true, dias: true } } } }
		}
	});

	const topExtras = [...extrasPorUser.entries()]
		.map(([userId, horas]) => {
			const c = colaboradores.find((x) => x.id === userId);
			return {
				colaboradorId: userId,
				nome: c?.usuario.nome ?? '—',
				horas: Number(horas.toFixed(2))
			};
		})
		.filter((row) => row.horas > 0)
		.sort((a, b) => b.horas - a.horas)
		.slice(0, 5);

	// ── Entradas do dia (status: pontual / atrasado / falta / sem_jornada) ────
	const registrosDia = await prisma.registro.findMany({
		where: { empresaId, marcadoEm: refDia, tipo: 'entrada' },
		orderBy: { marcadoEm: 'asc' }
	});
	const entradaByUser = new Map(registrosDia.map((p) => [p.colaboradorId, p]));

	const dowKey = diaKeyFromDia(refKey);
	const entradasHoje = colaboradores
		.filter((c) => c.status === 'ativo')
		.map((c) => {
			const dias = (
				c.jornada ? versaoVigenteEm(c.jornada.versoes, dataPura(refKey)) : null
			) as JornadaDias | null;
			const cfg = dias ? dias[dowKey] : null;

			if (!c.jornada || !dias) {
				return {
					colaboradorId: c.id,
					nome: c.usuario.nome,
					jornadaEntrada: null,
					batidaEntrada: entradaByUser.get(c.id)?.marcadoEm.toISOString() ?? null,
					atrasoMin: 0,
					status: 'sem_jornada' as const
				};
			}

			if (!cfg?.ativo) {
				return {
					colaboradorId: c.id,
					nome: c.usuario.nome,
					jornadaEntrada: null,
					batidaEntrada: entradaByUser.get(c.id)?.marcadoEm.toISOString() ?? null,
					atrasoMin: 0,
					status: 'folga' as const
				};
			}

			const registro = entradaByUser.get(c.id);
			const previsto = cfg.entrada;
			const previstoMin = timeStringToMinutes(previsto);

			if (!registro) {
				// Sem batida: se ainda não passou da hora prevista no dia atual, marcar como pendente.
				const agora = new Date();
				const ehHoje = refKey === diaDe(agora);
				const agoraMin = ehHoje ? minutosDoDia(agora) : 24 * 60;
				const aindaNaoBateu = previstoMin !== null && agoraMin < previstoMin;
				return {
					colaboradorId: c.id,
					nome: c.usuario.nome,
					jornadaEntrada: previsto,
					batidaEntrada: null,
					atrasoMin: 0,
					status: aindaNaoBateu ? ('pendente' as const) : ('falta' as const)
				};
			}

			// Tem batida: calcula atraso em minutos relativo ao horário previsto local (UTC-3)
			const isoPrevisto = new Date(`${refKey}T${previsto}:00-03:00`);
			const atrasoMin = Math.round((registro.marcadoEm.getTime() - isoPrevisto.getTime()) / 60_000);
			const atrasado = atrasoMin > TOLERANCIA_ATRASO_MIN;

			return {
				colaboradorId: c.id,
				nome: c.usuario.nome,
				jornadaEntrada: previsto,
				batidaEntrada: registro.marcadoEm.toISOString(),
				atrasoMin,
				status: atrasado ? ('atrasado' as const) : ('pontual' as const)
			};
		})
		.sort((a, b) => {
			const ordem = { atrasado: 0, falta: 1, pendente: 2, pontual: 3, folga: 4, sem_jornada: 5 };
			return ordem[a.status] - ordem[b.status] || a.nome.localeCompare(b.nome);
		});

	const atrasosHoje = entradasHoje.filter((e) => e.status === 'atrasado').length;
	const faltasHoje = entradasHoje.filter((e) => e.status === 'falta').length;

	// ── Ausências no mês: justificativas (não-férias) e férias ativas ─────────
	const [justificativasMes, feriasAtivasNoMes] = await Promise.all([
		prisma.ausencia.count({
			where: {
				empresaId,
				tipo: { not: 'ferias' },
				...ausenciaNoPeriodo(mes.inicio, mes.fim)
			}
		}),
		prisma.ausencia.count({
			where: {
				empresaId,
				tipo: 'ferias',
				...ausenciaNoPeriodo(mes.inicio, mes.fim)
			}
		})
	]);

	return jsonOk({
		referenciaData: refKey,
		colaboradoresAtivos,
		totalColaboradores,
		totalColaboradoresRegistrados: totalColaboradores,
		pontosHoje,
		atrasosHoje,
		faltasHoje,
		justificativasMes,
		feriasAtivasNoMes,
		horasExtrasMes: Number(horasExtrasMes.toFixed(1)),
		horasDeficitMes: Number(horasDeficitMes.toFixed(1)),
		horasExtrasPorDia,
		topExtras,
		entradasHoje
	});
};
