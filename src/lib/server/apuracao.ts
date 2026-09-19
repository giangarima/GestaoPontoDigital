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
 *
 * PURO: sem Prisma. Minutos arredondados ao inteiro.
 */
import { diaDe, inicioDoDia, type Dia } from '@/lib/server/periodo';

/** Cada minuto entre 22h e 5h vale 60/52,5 minutos (hora de 52min30s). */
export const FATOR_HORA_NOTURNA = 60 / 52.5;

const MIN = 60_000;
const INICIO_NOTURNO_H = 22;
const FIM_NOTURNO_H = 5;

export interface ApuracaoDia {
	/** Minutos realizados, já com a hora noturna reduzida. */
	realizadoMin: number;
	/** Minutos de relógio trabalhados entre 22h e 5h (sem a redução). */
	noturnoMin: number;
	extraMin: number;
	deficitMin: number;
	/** Número ímpar de marcações válidas: a última ficou sem par. */
	incompleto: boolean;
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

/**
 * Apura um dia a partir das marcações válidas (qualquer ordem) e da jornada
 * contratual em minutos (0 = folga, `null` = sem jornada).
 */
export function apurarDia(
	marcacoes: Date[],
	contratualMin: number | null,
	abonado: boolean
): ApuracaoDia {
	const ordenadas = [...marcacoes].sort((a, b) => a.getTime() - b.getTime());
	let relogio = 0;
	let noturno = 0;
	for (let i = 0; i + 1 < ordenadas.length; i += 2) {
		const [ini, fim] = [ordenadas[i], ordenadas[i + 1]];
		relogio += (fim.getTime() - ini.getTime()) / MIN;
		noturno += minutosNoturnos(ini, fim);
	}
	const incompleto = ordenadas.length % 2 === 1;
	const realizadoMin = Math.round(relogio + noturno * (FATOR_HORA_NOTURNA - 1));

	const semComparacao = contratualMin === null || incompleto;
	return {
		realizadoMin,
		noturnoMin: Math.round(noturno),
		extraMin: semComparacao ? 0 : Math.max(0, realizadoMin - contratualMin),
		deficitMin: semComparacao || abonado ? 0 : Math.max(0, contratualMin - realizadoMin),
		incompleto
	};
}
