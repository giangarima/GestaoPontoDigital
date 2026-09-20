/**
 * @module lib/server/pendencias
 * @description Dias em aberto de uma empresa num período: aqueles em que o
 * trabalhador deixou de bater um ponto e a jornada ficou com número ímpar de
 * marcações válidas.
 *
 * É a ocorrência mais comum na operação real — num AFDT de produção de seis
 * meses, 10% dos dias e 19 de 21 trabalhadores. O sistema já marca esses dias
 * como `Incompleto` na apuração e, corretamente, não lança extra nem déficit
 * neles; o que faltava era o admin conseguir ENCONTRÁ-LOS sem abrir o espelho
 * de cada colaborador, um a um.
 *
 * O cálculo não é refeito aqui: a varredura chama `apurarPeriodo`, a mesma
 * fonte do espelho, do consolidado e do dashboard, e só filtra a ocorrência.
 * Assim a lista nunca diverge do documento legal.
 *
 * O tratamento continua sendo o da Portaria 671/2021 — lançamento manual pelo
 * admin (`criarInclusao`, fonte "I" com motivo), em `/admin/ajustes`.
 */
import { prisma } from '@/lib/server/db';
import { apurarPeriodo } from '@/lib/server/espelho/montar';
import {
	ausenciaNoPeriodo,
	instantesDoPeriodo,
	minutosDoDia,
	type Dia
} from '@/lib/server/periodo';

export interface MarcacaoPendente {
	/** "HH:MM" no fuso de Brasília. */
	hora: string;
	/** "O" original do REP | "I" já incluída pelo admin no tratamento. */
	fonte: 'O' | 'I';
}

export interface DiaPendente {
	/** Dia de calendário de Brasília (AAAA-MM-DD). */
	dia: Dia;
	semana: string;
	/** Marcações válidas do dia, em ordem cronológica. */
	marcacoes: MarcacaoPendente[];
	/** Minutos já apurados no dia (os pares que fecharam). */
	realizadoMin: number;
}

export interface PendenciaColaborador {
	colaboradorId: string;
	nome: string;
	cargo: string | null;
	dias: DiaPendente[];
}

export interface Pendencias {
	inicio: Dia;
	fim: Dia;
	/** Total de dias em aberto no período, somando todos os colaboradores. */
	total: number;
	colaboradores: PendenciaColaborador[];
}

/** Instante → "HH:MM" no fuso de Brasília. */
function horaBrt(instante: Date): string {
	const min = minutosDoDia(instante);
	return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/**
 * Varre os colaboradores ativos da empresa e devolve os dias em aberto de cada
 * um, do mais recente para o mais antigo. Colaboradores sem pendência ficam
 * fora da lista.
 *
 * `emitidoEm` define o "agora": o dia corrente ainda está em andamento e nunca
 * conta como pendência — o trabalhador só não bateu a saída ainda.
 */
export async function pendenciasDoPeriodo(
	empresaId: string,
	inicio: Dia,
	fim: Dia,
	emitidoEm: Date = new Date()
): Promise<Pendencias> {
	const colaboradores = await prisma.colaborador.findMany({
		where: { empresaId, deletedAt: null },
		include: {
			usuario: { select: { nome: true } },
			jornada: { include: { versoes: true } }
		},
		orderBy: { usuario: { nome: 'asc' } }
	});

	const janela = instantesDoPeriodo(inicio, fim);
	const [registros, ausencias] = await Promise.all([
		prisma.registro.findMany({
			where: { empresaId, marcadoEm: janela },
			orderBy: { marcadoEm: 'asc' },
			include: { anulacao: { select: { motivo: true } } }
		}),
		prisma.ausencia.findMany({
			where: { empresaId, status: 'aprovada', ...ausenciaNoPeriodo(inicio, fim) }
		})
	]);

	// Uma consulta para a empresa toda, agrupada em memória: são centenas de
	// linhas por mês, e N consultas por colaborador não se pagariam.
	const registrosPorColaborador = new Map<string, typeof registros>();
	for (const r of registros) {
		const lista = registrosPorColaborador.get(r.colaboradorId) ?? [];
		lista.push(r);
		registrosPorColaborador.set(r.colaboradorId, lista);
	}
	const ausenciasPorColaborador = new Map<string, typeof ausencias>();
	for (const a of ausencias) {
		const lista = ausenciasPorColaborador.get(a.colaboradorId) ?? [];
		lista.push(a);
		ausenciasPorColaborador.set(a.colaboradorId, lista);
	}

	const resultado: PendenciaColaborador[] = [];
	for (const c of colaboradores) {
		const marcacoes = registrosPorColaborador.get(c.id) ?? [];
		if (marcacoes.length === 0) continue;

		const apuracao = apurarPeriodo({
			inicio,
			fim,
			emitidoEm,
			versoes: c.jornada?.versoes ?? [],
			ausencias: ausenciasPorColaborador.get(c.id) ?? [],
			marcacoes,
			admissao: c.dataAdmissao,
			desligamento: c.deletedAt
		});

		const dias = apuracao.dias
			.filter((d) => d.ocorrencia === 'Incompleto')
			.map((d) => ({
				dia: d.dia,
				semana: d.semana,
				// As desconsideradas ficam de fora: não entram na apuração, então
				// não é a ausência delas que deixou o dia ímpar.
				marcacoes: d.marcacoes
					.filter((m) => !m.desconsiderada)
					.map((m) => ({ hora: horaBrt(m.marcadoEm), fonte: m.fonte })),
				realizadoMin: d.realizadoMin
			}))
			.reverse();

		if (dias.length > 0) {
			resultado.push({
				colaboradorId: c.id,
				nome: c.usuario.nome,
				cargo: c.cargo,
				dias
			});
		}
	}

	// Quem tem mais pendência aparece primeiro: é por onde o admin começa.
	resultado.sort((a, b) => b.dias.length - a.dias.length || a.nome.localeCompare(b.nome));

	return {
		inicio,
		fim,
		total: resultado.reduce((soma, c) => soma + c.dias.length, 0),
		colaboradores: resultado
	};
}
