/**
 * @module lib/server/perfil/montar
 * @description Perfil do colaborador para o dono do negócio, em três alturas:
 *
 * 1. **o dia** (hoje, ou o último dia com expediente): as batidas contra o
 *    previsto, onde foi o atraso e uma leitura em uma frase;
 * 2. **a semana** até esse dia, linha a linha;
 * 3. **o período** (30d/3m/6m/12m até ontem) em quatro cards: presença,
 *    pontualidade, onde atrasa e saldo de horas.
 *
 * Puro — recebe os dias já apurados pelo espelho (`apurarPeriodo`) e não refaz o
 * cálculo de horas. Atraso usa `ATRASO_MIN`, o mesmo corte do painel e da
 * tolerância do art. 58, §1º.
 *
 * **Dia com ajuste** (inclusão ou desconsideração do admin) fica fora da
 * pontualidade e do saldo: a batida incluída costuma entrar no horário previsto e
 * esconderia o atraso real. Por isso o saldo do perfil **não é o do espelho** — o
 * card diz quantos dias ficaram fora da conta. Presença e faltas são as do espelho.
 *
 * Os textos não usam pronome: o sistema não sabe o gênero de ninguém.
 */
import { somarDias } from '@/lib/server/feriado/calendario';
import { marcacoesPrevistas } from '@/lib/server/jornada';
import { ATRASO_MIN, MARGEM_FALTA_MIN } from '@/lib/server/painel/montar';
import { dataPura, diaDe, minutosDoDia, type Dia } from '@/lib/server/periodo';
import type { DiaEspelho, HorarioEspelho } from '@/lib/server/espelho/montar';
import { formatMinutos } from '@/utils/perfil';

// ── Período ──────────────────────────────────────────────────────────────────

export type PeriodoPerfil = '30d' | '3m' | '6m' | '12m';
export const PERIODOS_PERFIL: PeriodoPerfil[] = ['30d', '3m', '6m', '12m'];
const DIAS_DO_PERIODO: Record<PeriodoPerfil, number> = {
	'30d': 30,
	'3m': 91,
	'6m': 182,
	'12m': 365
};

export interface Intervalo {
	inicio: Dia;
	fim: Dia;
}

/** O período termina ontem: o dia corrente ainda está em andamento. */
export function intervaloDoPeriodo(periodo: PeriodoPerfil, agora: Date): Intervalo {
	const fim = somarDias(diaDe(agora), -1);
	return { inicio: somarDias(fim, -(DIAS_DO_PERIODO[periodo] - 1)), fim };
}

/** Períodos que cabem no tempo de casa (30 dias sempre). */
export function periodosDisponiveis(admissao: Dia | null, agora: Date): PeriodoPerfil[] {
	return PERIODOS_PERFIL.filter(
		(p) => p === '30d' || admissao === null || intervaloDoPeriodo(p, agora).inicio >= admissao
	);
}

// ── Desvios do dia ───────────────────────────────────────────────────────────

export interface DesviosDia {
	/** 1ª válida − 1ª prevista (negativo = adiantado). */
	entradaMin: number | null;
	/**
	 * Quanto a volta do intervalo passou do combinado: intervalo realizado − previsto.
	 * Mede a duração, não o horário — quem saiu tarde para o almoço e voltou depois
	 * do mesmo intervalo não atrasou a volta. Só em dia de 4 previstas e até 4 válidas.
	 */
	voltaMin: number | null;
	/** Última válida − última prevista, com o par fechado (positivo = saiu depois). */
	saidaMin: number | null;
	/** Intervalo realizado (2ª → 3ª válida) e o previsto, nas mesmas condições da volta. */
	intervaloMin: number | null;
	intervaloPrevistoMin: number | null;
	atrasoEntrada: boolean;
	voltaAtrasada: boolean;
	/** Intervalo mais de `ATRASO_MIN` abaixo do previsto (art. 71 da CLT). */
	intervaloCurto: boolean;
}

const minutosEntre = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60_000);

export function desviosDoDia(validas: Date[], previstas: Date[] | null): DesviosDia {
	const d: DesviosDia = {
		entradaMin: null,
		voltaMin: null,
		saidaMin: null,
		intervaloMin: null,
		intervaloPrevistoMin: null,
		atrasoEntrada: false,
		voltaAtrasada: false,
		intervaloCurto: false
	};
	if (!previstas || previstas.length === 0 || validas.length === 0) return d;

	d.entradaMin = minutosEntre(previstas[0], validas[0]);
	if (validas.length % 2 === 0) {
		d.saidaMin = minutosEntre(previstas[previstas.length - 1], validas[validas.length - 1]);
	}
	// Com mais de 4 marcações a 3ª já não é, necessariamente, a volta do intervalo.
	if (previstas.length === 4 && validas.length >= 3 && validas.length <= 4) {
		d.intervaloMin = minutosEntre(validas[1], validas[2]);
		d.intervaloPrevistoMin = minutosEntre(previstas[1], previstas[2]);
		d.voltaMin = d.intervaloMin - d.intervaloPrevistoMin;
	}
	d.atrasoEntrada = d.entradaMin > ATRASO_MIN;
	d.voltaAtrasada = d.voltaMin !== null && d.voltaMin > ATRASO_MIN;
	d.intervaloCurto =
		d.intervaloMin !== null && d.intervaloMin < d.intervaloPrevistoMin! - ATRASO_MIN;
	return d;
}

// ── Detalhe de um dia ────────────────────────────────────────────────────────

export type SituacaoDia =
	| 'normal'
	/** Dia encerrado com marcação ímpar: falta uma batida. */
	| 'aberto'
	/** Dia corrente, ainda acontecendo. */
	| 'em_andamento'
	| 'falta'
	| 'ausencia'
	| 'feriado'
	| 'sem_expediente'
	| 'fora_vinculo';

export interface MarcacaoDetalhe {
	/** "HH:MM" em Brasília. */
	hora: string;
	/** Incluída pelo admin no tratamento (fonte "I"). */
	incluida: boolean;
}

export interface DiaDetalhe {
	dia: Dia;
	situacao: SituacaoDia;
	/** Tipo da ausência aprovada (ferias, atestado, folga…), se houver. */
	ausenciaTipo: string | null;
	/** Nome do feriado, se houver. */
	feriado: string | null;
	/** Horário contratual do dia, "HH:MM". Vazio sem expediente. */
	previstas: string[];
	/** Marcações válidas (desconsideradas saem), em ordem. */
	marcacoes: MarcacaoDetalhe[];
	desvios: DesviosDia;
	/** Houve inclusão ou desconsideração do admin no dia. */
	ajuste: boolean;
	realizadoMin: number;
	/** 0 = sem expediente; null = sem jornada ou fora do vínculo. */
	contratualMin: number | null;
	/** Realizado do dia, ou `null` quando não é confiável (ajuste, batida faltando, em andamento). */
	totalMin: number | null;
}

function hhmm(instante: Date): string {
	const m = minutosDoDia(instante);
	return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function situacaoDe(d: DiaEspelho, validas: number, previstas: number, hoje: Dia): SituacaoDia {
	if (d.ocorrencia === 'Fora do vínculo') return 'fora_vinculo';
	if (d.ausenciaTipo) return 'ausencia';
	if (d.falta) return 'falta';
	// Dia corrente: em andamento até a pessoa fechar as marcações previstas.
	if (d.dia >= hoje && (validas % 2 === 1 || validas < previstas)) return 'em_andamento';
	if (validas % 2 === 1) return 'aberto';
	if (validas === 0 && (d.contratualMin ?? 0) === 0)
		return d.feriado ? 'feriado' : 'sem_expediente';
	return 'normal';
}

/** Detalha um dia apurado pelo espelho. `horarios` são os da mesma apuração. */
export function detalharDia(d: DiaEspelho, horarios: HorarioEspelho[], hoje: Dia): DiaDetalhe {
	const pares = d.horario ? (horarios.find((h) => h.codigo === d.horario)?.pares ?? null) : null;
	const previstas = pares ? marcacoesPrevistas(d.dia, pares) : null;
	const validas = d.marcacoes.filter((m) => !m.desconsiderada);
	const situacao = situacaoDe(d, validas.length, previstas?.length ?? 0, hoje);
	const ajuste = d.marcacoes.some((m) => m.fonte === 'I' || m.desconsiderada);
	const confiavel = !ajuste && situacao !== 'aberto' && situacao !== 'em_andamento';
	return {
		dia: d.dia,
		situacao,
		ausenciaTipo: d.ausenciaTipo,
		feriado: d.feriado?.nome ?? null,
		previstas: (previstas ?? []).map(hhmm),
		marcacoes: validas.map((m) => ({ hora: hhmm(m.marcadoEm), incluida: m.fonte === 'I' })),
		desvios: desviosDoDia(
			validas.map((m) => m.marcadoEm),
			previstas
		),
		ajuste,
		realizadoMin: d.realizadoMin,
		contratualMin: d.contratualMin,
		totalMin: confiavel && validas.length > 0 ? d.realizadoMin : null
	};
}

const temExpediente = (d: DiaDetalhe) => (d.contratualMin ?? 0) > 0;

// ── Dia de referência ────────────────────────────────────────────────────────

export interface DiaReferencia {
	/** "hoje" ou o último dia com expediente ("ultimo"), quando hoje não tem. */
	rotulo: 'hoje' | 'ultimo';
	dia: DiaDetalhe;
}

/**
 * Hoje, se tem expediente e não é ausência; senão o último dia anterior com
 * expediente ou com marcação (fora de ausência). `dias` em ordem crescente.
 */
export function diaDeReferencia(dias: DiaDetalhe[], hoje: Dia): DiaReferencia | null {
	const util = (d: DiaDetalhe) =>
		d.situacao !== 'ausencia' &&
		d.situacao !== 'fora_vinculo' &&
		(temExpediente(d) || d.marcacoes.length > 0);
	const doDia = dias.find((d) => d.dia === hoje);
	if (doDia && util(doDia)) return { rotulo: 'hoje', dia: doDia };
	const anterior = [...dias].reverse().find((d) => d.dia < hoje && util(d));
	return anterior ? { rotulo: 'ultimo', dia: anterior } : null;
}

export type Tom = 'ok' | 'aviso' | 'alerta' | 'neutro';

export interface Chip {
	texto: string;
	tom: Tom;
}

/** Situação do dia de referência em poucas palavras, para o canto do card. */
export function chipDoDia(d: DiaDetalhe, agora: Date): Chip {
	const { desvios } = d;
	if (d.situacao === 'falta') return { texto: 'Falta', tom: 'alerta' };
	if (d.situacao === 'aberto') return { texto: 'Batida faltando', tom: 'aviso' };
	if (d.situacao === 'em_andamento' && d.marcacoes.length === 0) {
		// Mesmo critério do painel: até MARGEM_FALTA_MIN depois da entrada não é falta.
		const prevista = d.previstas[0];
		const passou = minutosDoDia(agora) - minutosDoHorario(prevista);
		if (passou > MARGEM_FALTA_MIN)
			return { texto: `Falta provável · previsto ${prevista}`, tom: 'alerta' };
		if (passou > ATRASO_MIN)
			return { texto: `Sem entrada até agora · previsto ${prevista}`, tom: 'aviso' };
		return { texto: `Entrada prevista às ${prevista}`, tom: 'neutro' };
	}
	if (desvios.atrasoEntrada && desvios.voltaAtrasada)
		return { texto: 'Atraso na entrada e na volta do intervalo', tom: 'aviso' };
	if (desvios.atrasoEntrada)
		return { texto: `Atraso de ${formatMinutos(desvios.entradaMin!)} na entrada`, tom: 'aviso' };
	if (desvios.voltaAtrasada)
		return {
			texto: `Volta do intervalo ${formatMinutos(desvios.voltaMin!)} atrasada`,
			tom: 'aviso'
		};
	if (desvios.intervaloCurto)
		return { texto: `Intervalo curto (${formatMinutos(desvios.intervaloMin!)})`, tom: 'aviso' };
	if (d.situacao === 'em_andamento') return { texto: 'Em andamento', tom: 'neutro' };
	if (!temExpediente(d)) return { texto: 'Dia sem expediente', tom: 'neutro' };
	return { texto: 'No horário', tom: 'ok' };
}

function minutosDoHorario(hhmm: string): number {
	const [h, m] = hhmm.split(':').map(Number);
	return h * 60 + m;
}

// ── Semana ───────────────────────────────────────────────────────────────────

export interface SemanaPerfil {
	inicio: Dia;
	fim: Dia;
	dias: DiaDetalhe[];
	/** Realizado e previsto só dos dias confiáveis (e das faltas). */
	realizadoMin: number;
	previstoMin: number;
	/** Dias encerrados que ficaram fora do total: ajuste ou batida faltando. */
	diasForaDaConta: number;
	atrasosEntrada: number;
	voltasAtrasadas: number;
	faltas: number;
}

/** Segunda-feira da semana do dia. */
export function inicioDaSemana(dia: Dia): Dia {
	const dow = dataPura(dia).getUTCDay();
	return somarDias(dia, -((dow + 6) % 7));
}

/** Da segunda até o dia de referência. Sem linha para dia sem expediente e sem batida. */
export function montarSemana(dias: DiaDetalhe[], ref: Dia): SemanaPerfil {
	const inicio = inicioDaSemana(ref);
	const daSemana = dias.filter(
		(d) =>
			d.dia >= inicio &&
			d.dia <= ref &&
			d.situacao !== 'fora_vinculo' &&
			(d.situacao !== 'sem_expediente' || d.marcacoes.length > 0)
	);
	let realizadoMin = 0;
	let previstoMin = 0;
	let diasForaDaConta = 0;
	for (const d of daSemana) {
		if (d.situacao === 'falta') {
			previstoMin += d.contratualMin ?? 0;
		} else if (d.totalMin !== null) {
			realizadoMin += d.totalMin;
			previstoMin += d.contratualMin ?? 0;
		} else if (d.marcacoes.length > 0 && d.situacao !== 'em_andamento') {
			diasForaDaConta++;
		}
	}
	return {
		inicio,
		fim: ref,
		dias: daSemana,
		realizadoMin,
		previstoMin,
		diasForaDaConta,
		atrasosEntrada: daSemana.filter((d) => d.desvios.atrasoEntrada).length,
		voltasAtrasadas: daSemana.filter((d) => d.desvios.voltaAtrasada).length,
		faltas: daSemana.filter((d) => d.situacao === 'falta').length
	};
}

// ── Cards do período ─────────────────────────────────────────────────────────

export interface CardsPerfil {
	presenca: {
		diasComMarcacao: number;
		/** Dias com expediente, no vínculo e sem ausência (os do espelho). */
		diasPrevistos: number;
		faltas: number;
		percentual: number | null;
		/** O que não conta como dia previsto. */
		ferias: number;
		atestado: number;
		outrasAusencias: number;
		/** Dias sem expediente na jornada (DSR, folga, feriado) e folga compensatória. */
		folgas: number;
	};
	pontualidade: {
		/** Dias com marcação e sem ajuste do admin. */
		diasAvaliados: number;
		/** Sem atraso na entrada nem na volta do intervalo. */
		diasSemAtraso: number;
		percentual: number | null;
	};
	ondeAtrasa: {
		onde: 'entrada' | 'volta' | 'ambos' | 'nenhum';
		entradas: number;
		voltas: number;
		/** Mediana dos atrasos (só os dias com atraso). */
		tipicoEntradaMin: number | null;
		tipicoVoltaMin: number | null;
	};
	saldo: {
		realizadoMin: number;
		previstoMin: number;
		saldoMin: number;
		/** Dias com marcação que ficaram fora da conta. */
		diasComAjuste: number;
		diasComBatidaFaltando: number;
	};
	/** Base da leitura do dia. */
	padrao: {
		diasComAtraso: number;
		/** Nos dias de atraso na entrada, a saída passa do previsto em ao menos metade do atraso. */
		compensaNaSaida: boolean;
	};
}

const percentual = (parte: number, todo: number) =>
	todo === 0 ? null : Math.round((parte / todo) * 1000) / 10;

function mediana(xs: number[]): number | null {
	if (xs.length === 0) return null;
	const o = [...xs].sort((a, b) => a - b);
	const meio = Math.floor(o.length / 2);
	return o.length % 2 ? o[meio] : Math.round((o[meio - 1] + o[meio]) / 2);
}

const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Dias seguidos de atraso na entrada antes de dizer que a pessoa "costuma" compensar. */
const MIN_DIAS_PADRAO = 3;

export function montarCards(dias: DiaDetalhe[]): CardsPerfil {
	const noVinculo = dias.filter((d) => d.situacao !== 'fora_vinculo');
	const previstos = noVinculo.filter((d) => temExpediente(d) && d.situacao !== 'ausencia');
	const comMarcacao = previstos.filter((d) => d.marcacoes.length > 0);
	const faltas = previstos.filter((d) => d.situacao === 'falta').length;
	const ausencia = (tipo: string) =>
		noVinculo.filter((d) => d.situacao === 'ausencia' && d.ausenciaTipo === tipo).length;

	const avaliados = noVinculo.filter(
		(d) => d.marcacoes.length > 0 && !d.ajuste && d.desvios.entradaMin !== null
	);
	const atrasosEntrada = avaliados.filter((d) => d.desvios.atrasoEntrada);
	const voltasAtrasadas = avaliados.filter((d) => d.desvios.voltaAtrasada);
	const comAtraso = avaliados.filter((d) => d.desvios.atrasoEntrada || d.desvios.voltaAtrasada);

	const entradas = atrasosEntrada.length;
	const voltas = voltasAtrasadas.length;
	let onde: CardsPerfil['ondeAtrasa']['onde'] = 'nenhum';
	if (entradas > 0 || voltas > 0) {
		if (entradas >= 2 * voltas) onde = 'entrada';
		else if (voltas >= 2 * entradas) onde = 'volta';
		else onde = 'ambos';
	}

	// Saldo: dias encerrados sem ajuste nem batida faltando; a falta entra como déficit.
	let realizadoMin = 0;
	let previstoMin = 0;
	let diasComAjuste = 0;
	let diasComBatidaFaltando = 0;
	for (const d of noVinculo) {
		if (d.situacao === 'ausencia') continue;
		if (d.situacao === 'falta') {
			previstoMin += d.contratualMin ?? 0;
		} else if (d.marcacoes.length === 0) {
			continue;
		} else if (d.ajuste) {
			diasComAjuste++;
		} else if (d.situacao === 'aberto') {
			diasComBatidaFaltando++;
		} else if (d.totalMin !== null) {
			realizadoMin += d.totalMin;
			previstoMin += d.contratualMin ?? 0;
		}
	}

	const compensacao = atrasosEntrada.filter((d) => d.desvios.saidaMin !== null);
	const compensaNaSaida =
		compensacao.length >= MIN_DIAS_PADRAO &&
		media(compensacao.map((d) => d.desvios.saidaMin!)) >=
			media(compensacao.map((d) => d.desvios.entradaMin!)) / 2;

	return {
		presenca: {
			diasComMarcacao: comMarcacao.length,
			diasPrevistos: previstos.length,
			faltas,
			percentual: percentual(comMarcacao.length, previstos.length),
			ferias: ausencia('ferias'),
			atestado: ausencia('atestado'),
			outrasAusencias: noVinculo.filter(
				(d) =>
					d.situacao === 'ausencia' && !['ferias', 'atestado', 'folga'].includes(d.ausenciaTipo!)
			).length,
			folgas:
				ausencia('folga') +
				noVinculo.filter((d) => d.contratualMin === 0 && d.situacao !== 'ausencia').length
		},
		pontualidade: {
			diasAvaliados: avaliados.length,
			diasSemAtraso: avaliados.length - comAtraso.length,
			percentual: percentual(avaliados.length - comAtraso.length, avaliados.length)
		},
		ondeAtrasa: {
			onde,
			entradas,
			voltas,
			tipicoEntradaMin: mediana(atrasosEntrada.map((d) => d.desvios.entradaMin!)),
			tipicoVoltaMin: mediana(voltasAtrasadas.map((d) => d.desvios.voltaMin!))
		},
		saldo: {
			realizadoMin,
			previstoMin,
			saldoMin: realizadoMin - previstoMin,
			diasComAjuste,
			diasComBatidaFaltando
		},
		padrao: { diasComAtraso: comAtraso.length, compensaNaSaida }
	};
}

// ── Leitura do dia ───────────────────────────────────────────────────────────

/**
 * Uma ou duas frases sobre o dia de referência à luz do período. Vazia quando o
 * dia não tem o que comentar.
 */
export function leituraDoDia(d: DiaDetalhe, cards: CardsPerfil): string {
	const { desvios } = d;
	const { ondeAtrasa, padrao } = cards;
	const frases: string[] = [];

	/** "como em 20 dos 21 dias…", "como em todos os 3 dias…", "no período houve 1 dia…". */
	const frequencia = (onde: string, k: number) => {
		const n = padrao.diasComAtraso;
		if (n === 0) return `O atraso foi ${onde}; no período não houve outro.`;
		if (n === 1) return `O atraso foi ${onde}; no período houve 1 dia com atraso.`;
		if (k === n) return `O atraso foi ${onde}, como em todos os ${n} dias com atraso do período.`;
		return `O atraso foi ${onde}, como em ${k} dos ${n} dias com atraso do período.`;
	};

	if (desvios.atrasoEntrada && desvios.voltaAtrasada) {
		frases.push('Atrasou na entrada e na volta do intervalo.');
	} else if (desvios.atrasoEntrada) {
		frases.push(frequencia('na entrada', ondeAtrasa.entradas));
	} else if (desvios.voltaAtrasada) {
		frases.push(frequencia('na volta do intervalo', ondeAtrasa.voltas));
	}
	if (desvios.atrasoEntrada && padrao.compensaNaSaida) {
		frases.push(
			'Costuma sair mais tarde para compensar: vale confirmar se esse horário foi combinado.'
		);
	}
	if (desvios.intervaloCurto) {
		frases.push(
			`O intervalo foi de ${formatMinutos(desvios.intervaloMin!)}, abaixo dos ${formatMinutos(desvios.intervaloPrevistoMin!)} previstos (art. 71 da CLT).`
		);
	}
	if (d.situacao === 'aberto') {
		frases.push('Falta uma batida no dia: o lançamento é feito em Ajustes.');
	}
	return frases.join(' ');
}
