/**
 * @module lib/server/banco-horas/carregar
 * @description Carrega do banco o saldo do banco de horas. A regra mora em
 * `montar.ts`; aqui só há consulta — a apuração é a mesma do espelho
 * (`apurarPeriodo`), com feriados e escala de folga.
 */
import { prisma } from '@/lib/server/db';
import { apurarPeriodo } from '@/lib/server/espelho/montar';
import { carregarEspelho } from '@/lib/server/espelho/gerar';
import { escalasDosColaboradores } from '@/lib/server/escala/carregar';
import { feriadosDoColaborador } from '@/lib/server/feriado/calendario';
import { feriadosDoPeriodo } from '@/lib/server/feriado/carregar';
import {
	ausenciaNoPeriodo,
	diaDaDataPura,
	diaDe,
	instantesDoPeriodo,
	type Dia
} from '@/lib/server/periodo';
import {
	ciclosAte,
	montarCiclo,
	type CicloBanco,
	type ConfigBanco,
	type DestinoNegativo,
	type Periodo,
	type RegimeBanco
} from './montar';

/** Ausência que consome saldo do banco (ver `movimentoDoDia`). */
export const TIPO_FOLGA = 'folga';

/** Configuração do banco da empresa; `null` sem banco (regime "nenhum" ou sem início). */
export async function configDoBanco(empresaId: string): Promise<ConfigBanco | null> {
	const e = await prisma.empresa.findUnique({
		where: { id: empresaId },
		select: { bancoHorasRegime: true, bancoHorasInicio: true, bancoHorasNegativo: true }
	});
	const regime = e?.bancoHorasRegime as RegimeBanco | undefined;
	if (!e || !regime || regime === 'nenhum' || !e.bancoHorasInicio) return null;
	return {
		regime,
		inicio: diaDaDataPura(e.bancoHorasInicio),
		negativo: e.bancoHorasNegativo as DestinoNegativo
	};
}

const menor = (a: Dia, b: Dia) => (a < b ? a : b);

/** Ciclo sem os movimentos diários — para listas. */
export type ResumoCiclo = Omit<CicloBanco, 'movimentos'>;
function resumo(c: CicloBanco): ResumoCiclo {
	const copia: Partial<CicloBanco> = { ...c };
	delete copia.movimentos;
	return copia as ResumoCiclo;
}

export interface LinhaBanco {
	colaboradorId: string;
	nome: string;
	cargo: string | null;
	departamento: string | null;
	atual: ResumoCiclo;
	anterior: ResumoCiclo | null;
}

export interface BancoEmpresa {
	config: ConfigBanco;
	/** `null` se hoje é anterior ao início do banco. */
	atual: Periodo | null;
	anterior: Periodo | null;
	linhas: LinhaBanco[];
}

/**
 * Ciclo atual e o anterior de todos os colaboradores ativos. Uma consulta por
 * tabela para a empresa toda, agrupada em memória (mesmo padrão do consolidado).
 */
export async function carregarBancoEmpresa(
	empresaId: string,
	agora: Date = new Date()
): Promise<BancoEmpresa | null> {
	const config = await configDoBanco(empresaId);
	if (!config) return null;

	const hoje = diaDe(agora);
	const ciclos = ciclosAte(config, hoje);
	const atual = ciclos.at(-1) ?? null;
	const anterior = ciclos.at(-2) ?? null;
	if (!atual) return { config, atual: null, anterior: null, linhas: [] };

	const inicio = (anterior ?? atual).inicio;
	const fim = menor(atual.fim, hoje);

	const colaboradores = await prisma.colaborador.findMany({
		where: { empresaId, deletedAt: null },
		orderBy: { usuario: { nome: 'asc' } },
		include: {
			usuario: { select: { nome: true } },
			departamento: { select: { nome: true } },
			jornada: { include: { versoes: true } }
		}
	});
	const ids = colaboradores.map((c) => c.id);
	const [registros, ausencias, feriados, escalas] = await Promise.all([
		prisma.registro.findMany({
			where: { empresaId, marcadoEm: instantesDoPeriodo(inicio, fim) },
			orderBy: { marcadoEm: 'asc' },
			include: { anulacao: true }
		}),
		prisma.ausencia.findMany({
			where: { empresaId, status: 'aprovada', ...ausenciaNoPeriodo(inicio, fim) }
		}),
		feriadosDoPeriodo(empresaId, inicio, fim),
		escalasDosColaboradores(ids, inicio, fim)
	]);

	const agrupar = <T extends { colaboradorId: string }>(itens: T[]) => {
		const mapa = new Map<string, T[]>();
		for (const i of itens) mapa.set(i.colaboradorId, [...(mapa.get(i.colaboradorId) ?? []), i]);
		return mapa;
	};
	const registrosPor = agrupar(registros);
	const ausenciasPor = agrupar(ausencias);

	const linhas = colaboradores.map((c): LinhaBanco => {
		const { dias } = apurarPeriodo({
			inicio,
			fim,
			emitidoEm: agora,
			versoes: c.jornada?.versoes ?? [],
			escala: escalas.get(c.id) ?? null,
			ausencias: ausenciasPor.get(c.id) ?? [],
			feriados: feriadosDoColaborador(feriados, c.id),
			marcacoes: registrosPor.get(c.id) ?? [],
			admissao: c.dataAdmissao,
			desligamento: c.deletedAt
		});
		return {
			colaboradorId: c.id,
			nome: c.usuario.nome,
			cargo: c.cargo,
			departamento: c.departamento?.nome ?? null,
			atual: resumo(montarCiclo(atual, dias, hoje, config.negativo)),
			anterior: anterior ? resumo(montarCiclo(anterior, dias, hoje, config.negativo)) : null
		};
	});

	return { config, atual, anterior, linhas };
}

export interface ExtratoBanco {
	config: ConfigBanco;
	colaborador: { id: string; nome: string };
	/** Todos os ciclos até hoje, do mais antigo ao atual. */
	ciclos: Periodo[];
	/** O ciclo pedido (padrão: o atual), com os movimentos diários. */
	ciclo: CicloBanco | null;
	/** Folgas compensatórias lançadas no ciclo (para cancelar). */
	folgas: { id: string; dataInicio: Dia; dataFim: Dia; motivo: string | null }[];
}

/**
 * Extrato de um colaborador num ciclo (o que começa em `cicloInicio`, ou o atual).
 * `null` sem banco na empresa ou colaborador de outra empresa.
 */
export async function carregarExtratoBanco(
	empresaId: string,
	colaboradorId: string,
	agora: Date = new Date(),
	cicloInicio?: Dia
): Promise<ExtratoBanco | null> {
	const config = await configDoBanco(empresaId);
	if (!config) return null;

	const hoje = diaDe(agora);
	const ciclos = ciclosAte(config, hoje);
	const alvo = cicloInicio ? ciclos.find((c) => c.inicio === cicloInicio) : ciclos.at(-1);

	if (!alvo) {
		const c = await prisma.colaborador.findFirst({
			where: { id: colaboradorId, empresaId },
			select: { id: true, usuario: { select: { nome: true } } }
		});
		return c
			? { config, colaborador: { id: c.id, nome: c.usuario.nome }, ciclos, ciclo: null, folgas: [] }
			: null;
	}

	const carga = await carregarEspelho(
		empresaId,
		colaboradorId,
		alvo.inicio,
		menor(alvo.fim, hoje),
		agora
	);
	if (!carga) return null;
	const { dias } = apurarPeriodo({
		...carga.entrada,
		admissao: carga.entrada.trabalhador.admissao,
		desligamento: carga.entrada.trabalhador.desligamento
	});
	const folgas = await prisma.ausencia.findMany({
		where: {
			colaboradorId,
			empresaId,
			tipo: TIPO_FOLGA,
			status: 'aprovada',
			...ausenciaNoPeriodo(alvo.inicio, alvo.fim)
		},
		orderBy: { dataInicio: 'asc' },
		select: { id: true, dataInicio: true, dataFim: true, motivo: true }
	});
	return {
		config,
		colaborador: { id: colaboradorId, nome: carga.entrada.trabalhador.nome },
		ciclos,
		ciclo: montarCiclo(alvo, dias, hoje, config.negativo),
		folgas: folgas.map((f) => ({
			...f,
			dataInicio: diaDaDataPura(f.dataInicio),
			dataFim: diaDaDataPura(f.dataFim)
		}))
	};
}
