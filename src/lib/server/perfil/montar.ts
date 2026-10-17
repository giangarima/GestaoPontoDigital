/**
 * @module lib/server/perfil/montar
 * @description Perfil do colaborador ao longo do tempo: pontualidade, assiduidade,
 * horas e local da batida, com a tendência por semana/mês e os padrões por dia da
 * semana. Puro — recebe a apuração do espelho (`apurarPeriodo`) e não recalcula
 * horas: os totais são os do espelho, então o perfil nunca diverge dele.
 *
 * Atraso usa `ATRASO_MIN`, o mesmo corte do painel e da tolerância do art. 58,
 * §1º. Ressalva: a inclusão do admin para uma batida esquecida costuma entrar no
 * horário previsto e esconde um possível atraso — por isso as inclusões aparecem
 * como indicador próprio na assiduidade.
 */
import { marcacoesPrevistas } from '@/lib/server/jornada';
import { ATRASO_MIN } from '@/lib/server/painel/montar';
import { dataPura, diaDaDataPura, diaDe, type Dia } from '@/lib/server/periodo';
import type { ApuracaoPeriodo, DiaEspelho } from '@/lib/server/espelho/montar';

export type PeriodoPerfil = '30d' | '3m' | '6m' | '12m';
export const PERIODOS_PERFIL: PeriodoPerfil[] = ['30d', '3m', '6m', '12m'];
const DIAS_DO_PERIODO: Record<PeriodoPerfil, number> = {
	'30d': 30,
	'3m': 91,
	'6m': 182,
	'12m': 365
};

export type Granularidade = 'semana' | 'mes';

export interface Intervalo {
	inicio: Dia;
	fim: Dia;
}

function somarDias(dia: Dia, n: number): Dia {
	const d = dataPura(dia);
	d.setUTCDate(d.getUTCDate() + n);
	return diaDaDataPura(d);
}

/**
 * Período atual (até ontem — o dia corrente está em andamento) e o anterior, de
 * mesmo tamanho, logo antes dele.
 */
export function intervalosDoPeriodo(
	periodo: PeriodoPerfil,
	agora: Date
): { atual: Intervalo; anterior: Intervalo; granularidade: Granularidade } {
	const n = DIAS_DO_PERIODO[periodo];
	const fim = somarDias(diaDe(agora), -1);
	const inicio = somarDias(fim, -(n - 1));
	return {
		atual: { inicio, fim },
		anterior: { inicio: somarDias(inicio, -n), fim: somarDias(inicio, -1) },
		granularidade: n <= 91 ? 'semana' : 'mes'
	};
}

// ── Desvios do dia ───────────────────────────────────────────────────────────

export interface DesviosDia {
	/** 1ª válida − 1ª prevista, em minutos (negativo = adiantado). */
	chegadaMin: number | null;
	atraso: boolean;
	/** Última prevista − última válida, se positiva (saiu antes). Só dia de par fechado. */
	saidaAntecipadaMin: number | null;
	/** Intervalo realizado − previsto (negativo = intervalo curto). Só com 4 e 4 marcações. */
	intervaloDifMin: number | null;
}

const minutosEntre = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60_000);

/** Desvios contra o horário contratual do dia; tudo `null` quando o dia não se avalia. */
export function desviosDoDia(dia: DiaEspelho, pares: [string, string][] | null): DesviosDia {
	const vazio: DesviosDia = {
		chegadaMin: null,
		atraso: false,
		saidaAntecipadaMin: null,
		intervaloDifMin: null
	};
	const validas = dia.marcacoes.filter((m) => !m.desconsiderada).map((m) => m.marcadoEm);
	if (!pares || pares.length === 0 || validas.length === 0 || dia.ausenciaTipo) return vazio;

	const previstas = marcacoesPrevistas(dia.dia, pares);
	const chegadaMin = minutosEntre(previstas[0], validas[0]);

	const parFechado = validas.length % 2 === 0;
	let saidaAntecipadaMin: number | null = null;
	if (parFechado) {
		const antes = minutosEntre(validas[validas.length - 1], previstas[previstas.length - 1]);
		saidaAntecipadaMin = antes > ATRASO_MIN ? antes : null;
	}

	let intervaloDifMin: number | null = null;
	if (validas.length === 4 && previstas.length === 4) {
		intervaloDifMin =
			minutosEntre(validas[1], validas[2]) - minutosEntre(previstas[1], previstas[2]);
	}

	return { chegadaMin, atraso: chegadaMin > ATRASO_MIN, saidaAntecipadaMin, intervaloDifMin };
}

// ── Situação do dia (calendário) ─────────────────────────────────────────────

export type SituacaoDiaPerfil =
	| 'no_horario'
	| 'atraso'
	| 'falta'
	| 'aberto'
	| 'ausencia'
	| 'folga'
	| 'sem_jornada'
	| 'fora_vinculo';

export function situacaoDoDia(dia: DiaEspelho, desvios: DesviosDia): SituacaoDiaPerfil {
	if (dia.ocorrencia === 'Fora do vínculo') return 'fora_vinculo';
	if (dia.ausenciaTipo) return 'ausencia';
	if (dia.falta) return 'falta';
	if (dia.ocorrencia === 'Incompleto') return 'aberto';
	if (dia.contratualMin === null) return 'sem_jornada';
	if (dia.contratualMin === 0) return 'folga';
	return desvios.atraso ? 'atraso' : 'no_horario';
}

// ── Resumo ───────────────────────────────────────────────────────────────────

export interface ResumoPerfil {
	pontualidade: {
		/** Dias com expediente em que houve marcação (base do percentual). */
		diasAvaliados: number;
		diasComAtraso: number;
		/** 0–100; `null` sem dia avaliado. */
		percentualNoHorario: number | null;
		/** Média só dos dias com atraso. */
		atrasoMedioMin: number | null;
		maiorAtrasoMin: number | null;
		atrasoTotalMin: number;
	};
	assiduidade: {
		diasPrevistos: number;
		faltas: number;
		diasEmAberto: number;
		diasAtestado: number;
		diasFerias: number;
		diasOutrasAusencias: number;
		/** Marcações lançadas pelo admin no tratamento (fonte "I"). */
		inclusoes: number;
		/** Marcações desconsideradas (anuladas) pelo admin. */
		desconsideradas: number;
	};
	horas: {
		realizadoMin: number;
		previstoMin: number;
		extraMin: number;
		deficitMin: number;
		saidasAntecipadas: number;
		saidaAntecipadaMediaMin: number | null;
		/** Intervalo mais de `ATRASO_MIN` abaixo do previsto (art. 71). */
		intervalosCurtos: number;
		intervalosLongos: number;
	};
	local: {
		/** Marcações originais (fonte "O") do período. */
		batidas: number;
		/** Batidas com conferência de local (dentro/fora/sem_localizacao). */
		conferidas: number;
		fora: number;
		semLocalizacao: number;
	};
}

export interface PontoSerie {
	/** Segunda-feira da semana ou "AAAA-MM". */
	chave: string;
	diasAvaliados: number;
	diasComAtraso: number;
	/** 0–100; `null` sem dia avaliado no bucket. */
	percentualAtraso: number | null;
	atrasoMedioMin: number | null;
	faltas: number;
}

export interface PontoDiaSemana {
	/** 0 = domingo … 6 = sábado. */
	diaSemana: number;
	diasAvaliados: number;
	diasComAtraso: number;
	percentualAtraso: number | null;
	atrasoMedioMin: number | null;
}

export type FaixaChegada = 'antes' | 'pontual' | 'ate15' | 'ate30' | 'acima30';

export interface DiaPerfil {
	dia: Dia;
	situacao: SituacaoDiaPerfil;
	chegadaMin: number | null;
}

export interface Perfil {
	semJornada: boolean;
	resumo: ResumoPerfil;
	serie: PontoSerie[];
	porDiaSemana: PontoDiaSemana[];
	chegada: Record<FaixaChegada, number>;
	dias: DiaPerfil[];
}

const media = (xs: number[]) =>
	xs.length === 0 ? null : Math.round(xs.reduce((s, x) => s + x, 0) / xs.length);
const percentual = (parte: number, todo: number) =>
	todo === 0 ? null : Math.round((parte / todo) * 1000) / 10;

export function faixaDaChegada(chegadaMin: number): FaixaChegada {
	if (chegadaMin < -ATRASO_MIN) return 'antes';
	if (chegadaMin <= ATRASO_MIN) return 'pontual';
	if (chegadaMin <= 15) return 'ate15';
	if (chegadaMin <= 30) return 'ate30';
	return 'acima30';
}

/** Segunda-feira da semana do dia. */
export function inicioDaSemana(dia: Dia): Dia {
	const dow = dataPura(dia).getUTCDay();
	return somarDias(dia, -((dow + 6) % 7));
}

interface DiaAvaliado {
	dia: DiaEspelho;
	desvios: DesviosDia;
}

function agregarAtrasos(avaliados: DiaAvaliado[]) {
	const comMarcacao = avaliados.filter((a) => a.desvios.chegadaMin !== null);
	const atrasos = comMarcacao.filter((a) => a.desvios.atraso).map((a) => a.desvios.chegadaMin!);
	return {
		diasAvaliados: comMarcacao.length,
		diasComAtraso: atrasos.length,
		percentualAtraso: percentual(atrasos.length, comMarcacao.length),
		atrasoMedioMin: media(atrasos)
	};
}

/**
 * Monta o perfil de um período. `apuracao` é a do espelho só desse período;
 * `localizacoes` são as `Registro.localizacao` das marcações originais dele.
 */
export function montarPerfil(
	apuracao: ApuracaoPeriodo,
	localizacoes: (string | null)[],
	granularidade: Granularidade
): Perfil {
	const paresDoHorario = new Map(apuracao.horarios.map((h) => [h.codigo, h.pares]));
	const todos: DiaAvaliado[] = apuracao.dias.map((dia) => ({
		dia,
		desvios: desviosDoDia(dia, dia.horario ? (paresDoHorario.get(dia.horario) ?? null) : null)
	}));
	// Base da pontualidade: dia com expediente, no vínculo, sem ausência.
	const comExpediente = todos.filter(
		(a) =>
			(a.dia.contratualMin ?? 0) > 0 &&
			!a.dia.ausenciaTipo &&
			a.dia.ocorrencia !== 'Fora do vínculo'
	);

	const atraso = agregarAtrasos(comExpediente);
	const minutosAtraso = comExpediente
		.filter((a) => a.desvios.atraso)
		.map((a) => a.desvios.chegadaMin!);

	const contaAusencia = (tipo: string | null) =>
		apuracao.dias.filter((d) =>
			tipo === null
				? d.ausenciaTipo !== null && !['atestado', 'ferias'].includes(d.ausenciaTipo)
				: d.ausenciaTipo === tipo
		).length;
	const marcacoes = apuracao.dias.flatMap((d) => d.marcacoes);

	const saidas = comExpediente
		.map((a) => a.desvios.saidaAntecipadaMin)
		.filter((m): m is number => m !== null);
	const intervalos = comExpediente
		.map((a) => a.desvios.intervaloDifMin)
		.filter((m): m is number => m !== null);

	const conferidas = localizacoes.filter(
		(l) => l === 'dentro' || l === 'fora' || l === 'sem_localizacao'
	);

	const resumo: ResumoPerfil = {
		pontualidade: {
			diasAvaliados: atraso.diasAvaliados,
			diasComAtraso: atraso.diasComAtraso,
			percentualNoHorario:
				atraso.percentualAtraso === null
					? null
					: Math.round((100 - atraso.percentualAtraso) * 10) / 10,
			atrasoMedioMin: atraso.atrasoMedioMin,
			maiorAtrasoMin: minutosAtraso.length ? Math.max(...minutosAtraso) : null,
			atrasoTotalMin: minutosAtraso.reduce((s, m) => s + m, 0)
		},
		assiduidade: {
			diasPrevistos: apuracao.totais.diasPrevistos,
			faltas: apuracao.totais.faltas,
			diasEmAberto: apuracao.totais.diasEmAberto,
			diasAtestado: contaAusencia('atestado'),
			diasFerias: contaAusencia('ferias'),
			diasOutrasAusencias: contaAusencia(null),
			inclusoes: marcacoes.filter((m) => m.fonte === 'I').length,
			desconsideradas: marcacoes.filter((m) => m.desconsiderada).length
		},
		horas: {
			realizadoMin: apuracao.totais.realizadoMin,
			previstoMin: apuracao.totais.previstoMin,
			extraMin: apuracao.totais.extraMin,
			deficitMin: apuracao.totais.deficitMin,
			saidasAntecipadas: saidas.length,
			saidaAntecipadaMediaMin: media(saidas),
			intervalosCurtos: intervalos.filter((d) => d < -ATRASO_MIN).length,
			intervalosLongos: intervalos.filter((d) => d > ATRASO_MIN).length
		},
		local: {
			batidas: localizacoes.length,
			conferidas: conferidas.length,
			fora: conferidas.filter((l) => l === 'fora').length,
			semLocalizacao: conferidas.filter((l) => l === 'sem_localizacao').length
		}
	};

	// Série: um ponto por semana/mês, inclusive os vazios, para o eixo não pular.
	const chaveDe = (dia: Dia) => (granularidade === 'mes' ? dia.slice(0, 7) : inicioDaSemana(dia));
	const avaliaveis = new Set(comExpediente);
	const baldes = new Map<string, DiaAvaliado[]>();
	for (const a of todos) {
		const chave = chaveDe(a.dia.dia);
		if (!baldes.has(chave)) baldes.set(chave, []);
		if (avaliaveis.has(a)) baldes.get(chave)!.push(a);
	}
	const serie: PontoSerie[] = [...baldes.entries()].map(([chave, itens]) => ({
		chave,
		...agregarAtrasos(itens),
		faltas: itens.filter((a) => a.dia.falta).length
	}));

	const porDiaSemana: PontoDiaSemana[] = Array.from({ length: 7 }, (_, diaSemana) => ({
		diaSemana,
		...agregarAtrasos(comExpediente.filter((a) => dataPura(a.dia.dia).getUTCDay() === diaSemana))
	}));

	const chegada: Record<FaixaChegada, number> = {
		antes: 0,
		pontual: 0,
		ate15: 0,
		ate30: 0,
		acima30: 0
	};
	for (const a of comExpediente) {
		if (a.desvios.chegadaMin !== null) chegada[faixaDaChegada(a.desvios.chegadaMin)]++;
	}

	return {
		semJornada: apuracao.semJornada,
		resumo,
		serie,
		porDiaSemana,
		chegada,
		dias: todos.map((a) => ({
			dia: a.dia.dia,
			situacao: situacaoDoDia(a.dia, a.desvios),
			chegadaMin: a.desvios.chegadaMin
		}))
	};
}
