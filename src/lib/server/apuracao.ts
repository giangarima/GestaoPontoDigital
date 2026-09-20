/**
 * @module lib/server/apuracao
 * @description Apuração da jornada realizada num dia — o mesmo cálculo para a
 * tela (espelho, histórico, consolidado, dashboard) e para o espelho em PDF.
 *
 * Regras:
 *  - As marcações válidas (não desconsideradas), em ordem, formam pares
 *    entrada/saída: 1ª–2ª, 3ª–4ª… Uma marcação sem par não conta e deixa o dia
 *    incompleto (esqueceu de bater ou o dia ainda está em andamento).
 *  - Hora noturna reduzida (CLT art. 73 §1º; exigida no espelho pelo art. 84, VI
 *    da Portaria 671/2021): entre 22h e 5h de Brasília, 52min30s valem 1 hora —
 *    cada minuto noturno conta 60/52,5. Regra do trabalhador urbano.
 *  - Extras = realizado − contratual; déficit = contratual − realizado. Dia
 *    abonado não tem déficit; dia incompleto não tem extras nem déficit; sem
 *    jornada (contratual `null`) não há contrato para comparar.
 *  - Tolerância da CLT (art. 58, §1º) — ver `toleranciaClt` abaixo.
 *
 * PURO: sem Prisma. Minutos arredondados ao inteiro.
 */
import { diaDe, inicioDoDia, type Dia } from '@/lib/server/periodo';

/** Cada minuto entre 22h e 5h vale 60/52,5 minutos (hora de 52min30s). */
export const FATOR_HORA_NOTURNA = 60 / 52.5;

const MIN = 60_000;
const INICIO_NOTURNO_H = 22;
const FIM_NOTURNO_H = 5;

/** CLT art. 58, §1º: variação máxima por marcação. */
export const TOLERANCIA_POR_MARCACAO_MIN = 5;
/** CLT art. 58, §1º: soma máxima das variações no dia. */
export const TOLERANCIA_DIARIA_MIN = 10;

export interface ApuracaoDia {
	/** Minutos realizados, já com a hora noturna reduzida. */
	realizadoMin: number;
	/** Minutos de relógio trabalhados entre 22h e 5h (sem a redução). */
	noturnoMin: number;
	extraMin: number;
	deficitMin: number;
	/** Número ímpar de marcações válidas: a última ficou sem par. */
	incompleto: boolean;
	/**
	 * Soma das variações absorvidas pela tolerância do art. 58, §1º (0 = a
	 * tolerância não se aplicou ou o dia foi cumprido no horário exato).
	 */
	toleranciaMin: number;
}

function diaAnterior(dia: Dia): Dia {
	const d = new Date(`${dia}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - 1);
	return d.toISOString().slice(0, 10);
}

function proximoDia(dia: Dia): Dia {
	const d = new Date(`${dia}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

/** Minutos de relógio de [inicio, fim) que caem entre 22h e 5h de Brasília. */
export function minutosNoturnos(inicio: Date, fim: Date): number {
	if (fim <= inicio) return 0;
	let total = 0;
	// Janela noturna que começa às 22h de `dia` e vai até 5h do dia seguinte;
	// começa no dia anterior para pegar o trecho de 0h–5h.
	for (let dia = diaAnterior(diaDe(inicio)); dia <= diaDe(fim); dia = proximoDia(dia)) {
		const janelaIni = inicioDoDia(dia).getTime() + INICIO_NOTURNO_H * 60 * MIN;
		const janelaFim = inicioDoDia(dia).getTime() + (24 + FIM_NOTURNO_H) * 60 * MIN;
		const sobreposicao = Math.min(fim.getTime(), janelaFim) - Math.max(inicio.getTime(), janelaIni);
		if (sobreposicao > 0) total += sobreposicao;
	}
	return total / MIN;
}

/** Soma de relógio e de minutos noturnos dos pares entrada/saída (em ordem). */
function somarPares(instantes: Date[]): { relogio: number; noturno: number } {
	let relogio = 0;
	let noturno = 0;
	for (let i = 0; i + 1 < instantes.length; i += 2) {
		const [ini, fim] = [instantes[i], instantes[i + 1]];
		relogio += (fim.getTime() - ini.getTime()) / MIN;
		noturno += minutosNoturnos(ini, fim);
	}
	return { relogio, noturno };
}

/** Minutos realizados (relógio + acréscimo da hora noturna reduzida). */
function realizadoDe({ relogio, noturno }: { relogio: number; noturno: number }): number {
	return Math.round(relogio + noturno * (FATOR_HORA_NOTURNA - 1));
}

/**
 * Tolerância da CLT, art. 58, §1º (redação da Lei 10.243/2001), na leitura
 * literal do texto — "as variações de horário **no registro de ponto** não
 * excedentes de cinco minutos, observado o limite máximo de dez minutos
 * diários" não são descontadas nem computadas como jornada extraordinária.
 * Vale para todas as marcações do dia, não só entrada e saída.
 *
 * Se qualquer variação passa de 5 min, ou se a soma do dia passa de 10, a
 * tolerância cai por inteiro e conta o tempo real — Súmula 366 do TST ("Se
 * ultrapassado esse limite, será considerada como extra a totalidade do tempo
 * que exceder a jornada normal"). A Súmula 449 impede ampliar esses limites por
 * norma coletiva, então eles são fixos.
 *
 * As variações são medidas em minutos cheios, como aparecem no espelho e no
 * comprovante. Devolve a soma das variações, ou `null` quando a regra não se
 * aplica (quantidade de marcações diferente da prevista ou limites estourados).
 */
export function toleranciaClt(marcacoes: Date[], previstas: Date[]): number | null {
	if (previstas.length === 0 || marcacoes.length !== previstas.length) return null;
	const minutoDe = (d: Date) => Math.floor(d.getTime() / MIN);
	let soma = 0;
	for (let i = 0; i < marcacoes.length; i++) {
		const variacao = Math.abs(minutoDe(marcacoes[i]) - minutoDe(previstas[i]));
		if (variacao > TOLERANCIA_POR_MARCACAO_MIN) return null;
		soma += variacao;
	}
	return soma > TOLERANCIA_DIARIA_MIN ? null : soma;
}

/**
 * Apura um dia a partir das marcações válidas (qualquer ordem) e da jornada
 * contratual em minutos (0 = folga, `null` = sem jornada).
 *
 * `previstas` são os instantes das marcações previstas no horário contratual
 * (ver `marcacoesPrevistas`); quando informadas e dentro da tolerância do art.
 * 58, §1º, extras e déficit são apurados como se o dia tivesse sido cumprido no
 * horário — o realizado continua sendo o tempo real, e o acréscimo da hora
 * noturna do próprio horário contratual é preservado.
 */
export function apurarDia(
	marcacoes: Date[],
	contratualMin: number | null,
	abonado: boolean,
	previstas?: Date[]
): ApuracaoDia {
	const ordenadas = [...marcacoes].sort((a, b) => a.getTime() - b.getTime());
	const { relogio, noturno } = somarPares(ordenadas);
	const incompleto = ordenadas.length % 2 === 1;
	const realizadoMin = realizadoDe({ relogio, noturno });

	const semComparacao = contratualMin === null || incompleto;
	const tolerancia = semComparacao || !previstas ? null : toleranciaClt(ordenadas, previstas);
	// Dentro da tolerância, compara-se o horário contratual consigo mesmo.
	const comparadoMin = tolerancia === null ? realizadoMin : realizadoDe(somarPares(previstas!));

	return {
		realizadoMin,
		noturnoMin: Math.round(noturno),
		extraMin: semComparacao ? 0 : Math.max(0, comparadoMin - contratualMin),
		deficitMin: semComparacao || abonado ? 0 : Math.max(0, contratualMin - comparadoMin),
		incompleto,
		toleranciaMin: tolerancia ?? 0
	};
}
