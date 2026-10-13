/**
 * @module lib/server/painel/carregar
 * @description Carrega do banco o painel de um dia. As regras vivem em
 * `montar.ts` (puro); aqui só há consulta e agrupamento — mesmo par de
 * `espelho/montar.ts` × `espelho/gerar.ts`.
 *
 * O painel é consultado de novo a cada atualização automática, então o custo por
 * requisição importa: sete consultas em paralelo, mais as duas da escala de folga
 * (que dependem dos ids dos colaboradores), uma passada em memória e nenhuma
 * varredura do mês inteiro de marcações.
 */
import { prisma } from '@/lib/server/db';
import { STATUS_APROVADA } from '@/lib/server/ausencia';
import { horarioDoDia, type EscalaColaborador } from '@/lib/server/escala/calendario';
import { escalasDosColaboradores } from '@/lib/server/escala/carregar';
import { feriadosDoPeriodo } from '@/lib/server/feriado/carregar';
import type { Feriados, TipoFeriado } from '@/lib/server/feriado/calendario';
import { contarDiasEmAberto } from '@/lib/server/pendencias';
import { ausenciaDateKeys } from '@/lib/server/timesheet';
import {
	ausenciaNoPeriodo,
	diaDaDataPura,
	diaDe,
	diasDoMes,
	inicioDoDia,
	instantesDoPeriodo,
	type Dia
} from '@/lib/server/periodo';
import {
	ATRASO_MIN,
	MARGEM_FALTA_MIN,
	montarLinha,
	ordenarLinhas,
	resumirLinhas,
	type ColaboradorPainel,
	type LinhaPainel,
	type ResumoPainel
} from './montar';

/** Ausências pendentes que cabem ao admin revisar — férias têm tela própria. */
const STATUS_PENDENTE = 'pendente';

/** Até onde procurar um dia vizinho com escala, quando o dia está vazio. */
const ALCANCE_NAVEGACAO_DIAS = 14;

export interface AtencaoPainel {
	atrasados: number;
	faltasProvaveis: number;
	/** Dias em aberto do mês do dia de referência. */
	diasEmAberto: number;
	/** Ausências não-férias aguardando aprovação, sem recorte de mês. */
	justificativasPendentes: number;
}

export interface PainelDia {
	dia: Dia;
	ehHoje: boolean;
	ehFuturo: boolean;
	/** Constantes da decisão, para a tela explicar os rótulos sem repetir número. */
	tolerancias: { atrasoMin: number; faltaMin: number };
	resumo: ResumoPainel & { colaboradoresAtivos: number };
	atencao: AtencaoPainel;
	linhas: LinhaPainel[];
	/** Feriado ou ponto facultativo do dia, com quantos estão escalados. */
	feriado: { nome: string; tipo: TipoFeriado; abrangencia: string; escalados: number } | null;
	/** Ninguém tem expediente previsto no dia (domingo, feriado, escala vazia). */
	semEscala: boolean;
	/** Só quando `semEscala`: dias vizinhos com expediente. `null` fora disso. */
	navegacao: { anterior: Dia | null; proximo: Dia | null } | null;
}

/** Desloca um dia pela aritmética de `Date.UTC`, que normaliza mês e ano. */
function deslocar(dia: Dia, dias: number): Dia {
	const [ano, mes, d] = dia.split('-').map(Number);
	return new Date(Date.UTC(ano, mes - 1, d + dias)).toISOString().slice(0, 10);
}

type ColaboradorCarregado = {
	id: string;
	dataAdmissao: Date | null;
	deletedAt: Date | null;
	usuario: { nome: string };
	departamento: { nome: string } | null;
	jornada: { versoes: { vigenciaInicio: Date; dias: unknown }[] } | null;
};

/**
 * Vínculo ativo no dia: admitido até ele e não desligado antes dele. Mesma
 * assimetria de fuso do espelho — `dataAdmissao` é data pura (lida em UTC) e
 * `deletedAt` é um instante (lido em Brasília).
 */
function noVinculo(c: ColaboradorCarregado, dia: Dia): boolean {
	if (c.dataAdmissao && diaDaDataPura(c.dataAdmissao) > dia) return false;
	if (c.deletedAt && diaDe(c.deletedAt) < dia) return false;
	return true;
}

/**
 * Primeiro dia vizinho em que alguém tem expediente previsto. Só é chamado
 * quando o dia consultado está vazio, para não pagar o custo no caso normal.
 */
function vizinhoComEscala(
	colaboradores: ColaboradorCarregado[],
	escalas: Map<string, EscalaColaborador>,
	feriados: Feriados,
	dia: Dia,
	passo: 1 | -1
): Dia | null {
	for (let k = 1; k <= ALCANCE_NAVEGACAO_DIAS; k++) {
		const candidato = deslocar(dia, k * passo);
		const feriado = feriados.get(candidato);
		const temEscala = colaboradores.some(
			(c) =>
				noVinculo(c, candidato) &&
				(!feriado || feriado.escalados.has(c.id)) &&
				horarioDoDia(c.jornada?.versoes ?? [], escalas.get(c.id) ?? null, candidato) !== null
		);
		if (temEscala) return candidato;
	}
	return null;
}

/**
 * Painel do dia. `agora` entra explícito para os testes serem determinísticos —
 * é ele que decide o que é "hoje" em toda a árvore de `montarLinha`.
 */
export async function carregarPainelDia(
	empresaId: string,
	dia: Dia,
	agora: Date = new Date()
): Promise<PainelDia> {
	const mes = diasDoMes(dia.slice(0, 7));

	const [
		colaboradores,
		registros,
		ausencias,
		empresa,
		diasEmAberto,
		justificativasPendentes,
		feriados
	] = await Promise.all([
		// Inclui quem foi desligado DEPOIS do dia consultado: no histórico a
		// pessoa ainda trabalhava ali.
		prisma.colaborador.findMany({
			where: {
				empresaId,
				AND: [
					// `status != 'inativo'` não casa com NULL em SQL (lógica de três
					// valores), e status nulo significa ativo — ver `colaborador.ts`.
					{ OR: [{ status: null }, { status: { not: 'inativo' } }] },
					{ OR: [{ deletedAt: null }, { deletedAt: { gte: inicioDoDia(dia) } }] }
				]
			},
			select: {
				id: true,
				dataAdmissao: true,
				deletedAt: true,
				usuario: { select: { nome: true } },
				departamento: { select: { nome: true } },
				jornada: { select: { versoes: { select: { vigenciaInicio: true, dias: true } } } }
			}
		}),
		// Anuladas ficam de fora já no SQL — não entram na apuração.
		prisma.registro.findMany({
			where: { empresaId, marcadoEm: instantesDoPeriodo(dia, dia), anulacao: { is: null } },
			orderBy: { marcadoEm: 'asc' },
			select: { colaboradorId: true, marcadoEm: true }
		}),
		prisma.ausencia.findMany({
			where: { empresaId, status: STATUS_APROVADA, ...ausenciaNoPeriodo(dia, dia) },
			select: { colaboradorId: true, tipo: true, dataInicio: true, dataFim: true }
		}),
		prisma.empresa.findUnique({
			where: { id: empresaId },
			select: { horaAbertura: true, horaFechamento: true }
		}),
		contarDiasEmAberto(empresaId, mes.inicio, mes.fim, agora),
		prisma.ausencia.count({
			where: { empresaId, status: STATUS_PENDENTE, tipo: { not: 'ferias' } }
		}),
		// Também cobre o alcance da navegação: no feriado vizinho só há escala de quem foi escalado.
		feriadosDoPeriodo(
			empresaId,
			deslocar(dia, -ALCANCE_NAVEGACAO_DIAS),
			deslocar(dia, ALCANCE_NAVEGACAO_DIAS)
		)
	]);
	const feriadoDoDia = feriados.get(dia) ?? null;
	// A escala também cobre o alcance da navegação: a folga de escala muda quem
	// tem expediente nos dias vizinhos.
	const escalas = await escalasDosColaboradores(
		colaboradores.map((c) => c.id),
		deslocar(dia, -ALCANCE_NAVEGACAO_DIAS),
		deslocar(dia, ALCANCE_NAVEGACAO_DIAS)
	);

	const marcacoesPorColaborador = new Map<string, Date[]>();
	for (const r of registros) {
		const lista = marcacoesPorColaborador.get(r.colaboradorId) ?? [];
		lista.push(r.marcadoEm);
		marcacoesPorColaborador.set(r.colaboradorId, lista);
	}

	// `ausenciaDateKeys` resolve o intervalo em dias puros, igual ao espelho.
	const ausenciaPorColaborador = new Map<string, { tipo: string }>();
	for (const a of ausencias) {
		if (ausenciaDateKeys([a]).has(dia)) {
			ausenciaPorColaborador.set(a.colaboradorId, { tipo: a.tipo });
		}
	}

	const horarioEmpresa = {
		abertura: empresa?.horaAbertura ?? null,
		fechamento: empresa?.horaFechamento ?? null
	};

	const noDia = colaboradores.filter((c) => noVinculo(c, dia));
	const linhas = ordenarLinhas(
		noDia.map((c) => {
			const entrada: ColaboradorPainel = {
				id: c.id,
				nome: c.usuario.nome,
				departamento: c.departamento?.nome ?? null,
				versoes: c.jornada?.versoes ?? [],
				escala: escalas.get(c.id) ?? null,
				marcacoes: marcacoesPorColaborador.get(c.id) ?? [],
				ausencia: ausenciaPorColaborador.get(c.id) ?? null,
				feriado: feriadoDoDia
					? {
							nome: feriadoDoDia.nome,
							tipo: feriadoDoDia.tipo,
							abrangencia: feriadoDoDia.abrangencia,
							escalado: feriadoDoDia.escalados.has(c.id)
						}
					: null
			};
			return montarLinha(entrada, dia, agora, horarioEmpresa);
		})
	);

	const resumo = resumirLinhas(linhas);
	const semEscala = resumo.escalados === 0;
	const hoje = diaDe(agora);

	return {
		dia,
		ehHoje: dia === hoje,
		ehFuturo: dia > hoje,
		tolerancias: { atrasoMin: ATRASO_MIN, faltaMin: MARGEM_FALTA_MIN },
		resumo: { ...resumo, colaboradoresAtivos: linhas.length },
		atencao: {
			atrasados: resumo.atrasados,
			faltasProvaveis: resumo.faltasProvaveis,
			diasEmAberto,
			justificativasPendentes
		},
		linhas,
		feriado: feriadoDoDia
			? {
					nome: feriadoDoDia.nome,
					tipo: feriadoDoDia.tipo,
					abrangencia: feriadoDoDia.abrangencia,
					escalados: feriadoDoDia.escalados.size
				}
			: null,
		semEscala,
		navegacao: semEscala
			? {
					anterior: vizinhoComEscala(colaboradores, escalas, feriados, dia, -1),
					proximo: vizinhoComEscala(colaboradores, escalas, feriados, dia, 1)
				}
			: null
	};
}

/** Contadores dos badges do menu — o mesmo cálculo que o painel usa. */
export async function carregarResumoAdmin(
	empresaId: string,
	agora: Date = new Date()
): Promise<{ diasEmAberto: number; justificativasPendentes: number }> {
	const mes = diasDoMes(diaDe(agora).slice(0, 7));
	const [diasEmAberto, justificativasPendentes] = await Promise.all([
		contarDiasEmAberto(empresaId, mes.inicio, mes.fim, agora),
		prisma.ausencia.count({
			where: { empresaId, status: STATUS_PENDENTE, tipo: { not: 'ferias' } }
		})
	]);
	return { diasEmAberto, justificativasPendentes };
}
