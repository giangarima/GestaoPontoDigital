/**
 * @module lib/server/espelho/montar
 * @description Monta o relatório Espelho de Ponto Eletrônico (Portaria MTP nº
 * 671/2021, art. 84) a partir dos dados já carregados. O mesmo documento
 * alimenta o PDF (`pdf.ts`) e os totais do espelho na tela.
 *
 * Conteúdo exigido pelo art. 84:
 *  I   empregador: nome, CNPJ/CPF e CAEPF/CNO, se houver;
 *  II  trabalhador: nome, CPF, data de admissão e cargo;
 *  III data de emissão e período;
 *  IV  horário e jornada contratual;
 *  V   marcações do REP e marcações tratadas (incluídas / desconsideradas);
 *  VI  duração das jornadas realizadas, com a hora noturna reduzida.
 *
 * Decisões (as mesmas do AEJ, ver `aej/montar.ts`):
 *  - Falta = dia com expediente, dentro do vínculo, sem marcação válida e sem
 *    ausência aprovada, anterior à emissão. Conta o dia contratual inteiro de déficit.
 *  - DSR = domingo sem expediente; demais dias sem expediente = folga.
 *  - Hoje e dias futuros estão em andamento: sem falta nem déficit.
 *
 * PURO (sem Prisma) — ver `gerar.ts` para a carga do banco.
 */
import { apurarDia } from '@/lib/server/apuracao';
import { horarioContratualDoDia, type VersaoVigencia } from '@/lib/server/jornada';
import { dataPura, diaDaDataPura, diaDe, type Dia } from '@/lib/server/periodo';
import { ausenciaDateKeys } from '@/lib/server/timesheet';

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const ROTULO_AUSENCIA: Record<string, string> = {
	ferias: 'Férias',
	atestado: 'Atestado',
	folga: 'Folga compensatória'
};

// ── Entrada ──────────────────────────────────────────────────────────────────

export interface MarcacaoEspelho {
	marcadoEm: Date;
	/** "O" original do REP | "I" incluída no tratamento. */
	fonte: string;
	nsr: bigint | null;
	criadoMotivo: string | null;
	/** Presente quando a marcação foi desconsiderada (anulada). */
	anulacao: { motivo: string } | null;
}

export interface AusenciaEspelho {
	tipo: string;
	/** Datas puras (meia-noite UTC). */
	dataInicio: Date;
	dataFim: Date;
}

/** Dados para apurar um período (sem a identificação do documento). */
export interface ApuracaoEntrada {
	inicio: Dia;
	fim: Dia;
	/** Momento da apuração: dias a partir de hoje estão em andamento. */
	emitidoEm: Date;
	versoes: VersaoVigencia[];
	/** Só as aprovadas. */
	ausencias: AusenciaEspelho[];
	marcacoes: MarcacaoEspelho[];
	/** Data pura (meia-noite UTC). */
	admissao: Date | null;
	/** Instante do desligamento (soft delete). */
	desligamento: Date | null;
}

export interface EspelhoEntrada extends Omit<ApuracaoEntrada, 'admissao' | 'desligamento'> {
	empresa: { razaoSocial: string; cnpj: string | null; caepfCno: string | null };
	trabalhador: {
		nome: string;
		cpf: string;
		/** Data pura (meia-noite UTC). */
		admissao: Date | null;
		/** Instante do desligamento (soft delete). */
		desligamento: Date | null;
		cargo: string | null;
	};
}

// ── Saída ────────────────────────────────────────────────────────────────────

export interface MarcacaoLinha {
	marcadoEm: Date;
	fonte: 'O' | 'I';
	desconsiderada: boolean;
	nsr: string | null;
}

export interface DiaEspelho {
	dia: Dia;
	semana: string;
	/** Código do horário contratual do dia (H1, H2…) ou null (sem expediente/sem jornada). */
	horario: string | null;
	marcacoes: MarcacaoLinha[];
	realizadoMin: number;
	noturnoMin: number;
	extraMin: number;
	deficitMin: number;
	/** Falta, Férias, Atestado, DSR, Folga, Incompleto… ('' = dia normal). */
	ocorrencia: string;
	falta: boolean;
}

export interface HorarioEspelho {
	codigo: string;
	pares: [string, string][];
	minutos: number;
}

export interface TratamentoEspelho {
	marcadoEm: Date;
	tipo: 'Incluída' | 'Desconsiderada';
	motivo: string;
}

export interface TotaisEspelho {
	realizadoMin: number;
	noturnoMin: number;
	extraMin: number;
	deficitMin: number;
	diasTrabalhados: number;
	faltas: number;
}

export interface ApuracaoPeriodo {
	/** Sem jornada cadastrada: não há contrato para apurar extras/déficit/faltas. */
	semJornada: boolean;
	horarios: HorarioEspelho[];
	dias: DiaEspelho[];
	totais: TotaisEspelho;
	tratamentos: TratamentoEspelho[];
}

export interface Espelho extends ApuracaoPeriodo {
	empresa: EspelhoEntrada['empresa'];
	trabalhador: Omit<EspelhoEntrada['trabalhador'], 'desligamento'>;
	inicio: Dia;
	fim: Dia;
	emitidoEm: Date;
}

export interface OpcoesEspelho {
	/**
	 * "tratada" (padrão): estado após o tratamento — inclusões contam,
	 * desconsideradas não. "original": só as marcações do REP, todas válidas.
	 */
	visao?: 'tratada' | 'original';
}

// ── Montagem ─────────────────────────────────────────────────────────────────

function diasEntre(inicio: Dia, fim: Dia): Dia[] {
	const dias: Dia[] = [];
	for (const d = dataPura(inicio); diaDaDataPura(d) <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
		dias.push(diaDaDataPura(d));
	}
	return dias;
}

/** Espelho completo (art. 84): identificação + apuração do período. */
export function montarEspelho(e: EspelhoEntrada, opcoes: OpcoesEspelho = {}): Espelho {
	const apuracao = apurarPeriodo(
		{ ...e, admissao: e.trabalhador.admissao, desligamento: e.trabalhador.desligamento },
		opcoes
	);
	return {
		empresa: e.empresa,
		trabalhador: {
			nome: e.trabalhador.nome,
			cpf: e.trabalhador.cpf,
			admissao: e.trabalhador.admissao,
			cargo: e.trabalhador.cargo
		},
		inicio: e.inicio,
		fim: e.fim,
		emitidoEm: e.emitidoEm,
		...apuracao
	};
}

/**
 * Apura todos os dias do período: marcações, jornada realizada, extras, déficit
 * e faltas. É a fonte única dos totais — espelho, consolidado e dashboard.
 */
export function apurarPeriodo(e: ApuracaoEntrada, opcoes: OpcoesEspelho = {}): ApuracaoPeriodo {
	const original = opcoes.visao === 'original';
	const hoje = diaDe(e.emitidoEm);
	const semJornada = e.versoes.length === 0;

	const admissao = e.admissao ? diaDaDataPura(e.admissao) : null;
	const desligamento = e.desligamento ? diaDe(e.desligamento) : null;
	const noVinculo = (dia: Dia) =>
		(!admissao || dia >= admissao) && (!desligamento || dia <= desligamento);

	// Ausência aprovada por dia → rótulo da ocorrência.
	const ausenciaDoDia = new Map<Dia, string>();
	for (const a of e.ausencias) {
		for (const dia of ausenciaDateKeys([a])) {
			ausenciaDoDia.set(dia, ROTULO_AUSENCIA[a.tipo] ?? 'Ausência justificada');
		}
	}

	const marcacoes = e.marcacoes
		.filter((m) => !original || m.fonte === 'O')
		.sort((a, b) => a.marcadoEm.getTime() - b.marcadoEm.getTime());
	const porDia = new Map<Dia, MarcacaoEspelho[]>();
	for (const m of marcacoes) {
		const dia = diaDe(m.marcadoEm);
		porDia.set(dia, [...(porDia.get(dia) ?? []), m]);
	}

	// Horários contratuais distintos do período → H1, H2…
	const horarios = new Map<string, HorarioEspelho>();
	const horarioDo = (dia: Dia): HorarioEspelho | null => {
		const h = horarioContratualDoDia(e.versoes, dia);
		if (!h) return null;
		const chave = h.pares.map((p) => p.join('-')).join('/');
		let item = horarios.get(chave);
		if (!item) {
			item = { codigo: `H${horarios.size + 1}`, pares: h.pares, minutos: h.minutos };
			horarios.set(chave, item);
		}
		return item;
	};

	const dias: DiaEspelho[] = diasEntre(e.inicio, e.fim).map((dia) => {
		const semana = SEMANA[dataPura(dia).getUTCDay()];
		const doDia = porDia.get(dia) ?? [];
		const linhas: MarcacaoLinha[] = doDia.map((m) => ({
			marcadoEm: m.marcadoEm,
			fonte: m.fonte === 'I' ? 'I' : 'O',
			desconsiderada: !original && m.anulacao !== null,
			nsr: m.nsr === null ? null : String(m.nsr)
		}));
		const validas = linhas.filter((l) => !l.desconsiderada).map((l) => l.marcadoEm);

		const vinculado = noVinculo(dia);
		const horario = vinculado ? horarioDo(dia) : null;
		// 0 = sem expediente (folga/DSR); null = sem jornada ou fora do vínculo.
		const contratual = semJornada || !vinculado ? null : (horario?.minutos ?? 0);
		const ausencia = ausenciaDoDia.get(dia);
		const apuracao = apurarDia(validas, contratual, ausencia !== undefined);

		const emAndamento = dia >= hoje;
		const falta =
			!emAndamento && !ausencia && contratual !== null && contratual > 0 && validas.length === 0;

		let ocorrencia = '';
		if (!vinculado) ocorrencia = 'Fora do vínculo';
		else if (ausencia) ocorrencia = ausencia;
		else if (falta) ocorrencia = 'Falta';
		else if (apuracao.incompleto && !emAndamento) ocorrencia = 'Incompleto';
		else if (contratual === 0 && validas.length === 0)
			ocorrencia = semana === 'Dom' ? 'DSR' : 'Folga';

		return {
			dia,
			semana,
			horario: horario?.codigo ?? null,
			marcacoes: linhas,
			realizadoMin: apuracao.realizadoMin,
			noturnoMin: apuracao.noturnoMin,
			extraMin: apuracao.extraMin,
			deficitMin: falta ? contratual : emAndamento ? 0 : apuracao.deficitMin,
			ocorrencia,
			falta
		};
	});

	const tratamentos: TratamentoEspelho[] = original
		? []
		: marcacoes.flatMap((m): TratamentoEspelho[] => {
				const itens: TratamentoEspelho[] = [];
				if (m.fonte === 'I')
					itens.push({ marcadoEm: m.marcadoEm, tipo: 'Incluída', motivo: m.criadoMotivo ?? '' });
				if (m.anulacao)
					itens.push({
						marcadoEm: m.marcadoEm,
						tipo: 'Desconsiderada',
						motivo: m.anulacao.motivo
					});
				return itens;
			});

	const soma = (campo: 'realizadoMin' | 'noturnoMin' | 'extraMin' | 'deficitMin') =>
		dias.reduce((total, d) => total + d[campo], 0);

	return {
		semJornada,
		horarios: [...horarios.values()],
		dias,
		totais: {
			realizadoMin: soma('realizadoMin'),
			noturnoMin: soma('noturnoMin'),
			extraMin: soma('extraMin'),
			deficitMin: soma('deficitMin'),
			diasTrabalhados: dias.filter((d) => d.realizadoMin > 0).length,
			faltas: dias.filter((d) => d.falta).length
		},
		tratamentos
	};
}
