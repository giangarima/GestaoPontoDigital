/**
 * @module lib/server/banco-horas/montar
 * @description Banco de horas (art. 59 da CLT), derivado da apuração.
 *
 * Não há saldo gravado: os movimentos saem de `apurarPeriodo`, então o banco
 * nunca diverge do espelho quando o admin trata uma marcação.
 *
 *  - **Regime** (por empresa): `mensal` (§6º — compensa no mesmo mês),
 *    `semestral` (§5º — acordo individual, até 6 meses) ou `anual` (§2º —
 *    convenção coletiva, até 12 meses). Ciclos fixos contados de `inicio`.
 *  - **Movimentos do dia** (até ontem; hoje está em andamento):
 *      crédito = extras do dia;
 *      débito  = déficit dos dias trabalhados — **falta fica fora** do banco
 *                (continua sendo falta, com desconto e reflexo no DSR);
 *      folga   = folga compensatória aprovada (ausência `folga`): consome o
 *                contratual do dia. No espelho o dia segue abonado; quem paga
 *                a folga é o banco.
 *  - **Vencimento**: no fim do ciclo, saldo positivo vira extra a pagar e o
 *    negativo é zerado ou descontado, conforme a empresa. O ciclo seguinte
 *    começa do zero.
 *
 * PURO (sem Prisma) — ver `carregar.ts`.
 */
import type { DiaEspelho } from '@/lib/server/espelho/montar';
import { dataPura, diaDaDataPura, type Dia } from '@/lib/server/periodo';

export type RegimeBanco = 'nenhum' | 'mensal' | 'semestral' | 'anual';
export type DestinoNegativo = 'zerar' | 'descontar';

export const REGIMES: readonly RegimeBanco[] = ['nenhum', 'mensal', 'semestral', 'anual'];
export const DESTINOS_NEGATIVO: readonly DestinoNegativo[] = ['zerar', 'descontar'];

export const MESES_DO_CICLO: Record<Exclude<RegimeBanco, 'nenhum'>, number> = {
	mensal: 1,
	semestral: 6,
	anual: 12
};

export interface ConfigBanco {
	regime: Exclude<RegimeBanco, 'nenhum'>;
	/** Primeiro dia do primeiro ciclo. */
	inicio: Dia;
	negativo: DestinoNegativo;
}

export interface Periodo {
	inicio: Dia;
	fim: Dia;
}

/** Soma `meses` a um dia, sem estourar o fim do mês (31/01 + 1 → 28/02). */
function somarMeses(dia: Dia, meses: number): Dia {
	const d = dataPura(dia);
	const alvo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + meses, 1));
	const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
	alvo.setUTCDate(Math.min(d.getUTCDate(), ultimo));
	return diaDaDataPura(alvo);
}

function vespera(dia: Dia): Dia {
	const d = dataPura(dia);
	d.setUTCDate(d.getUTCDate() - 1);
	return diaDaDataPura(d);
}

/** Ciclo n (0, 1, 2…) a partir do início. */
function cicloN(config: ConfigBanco, n: number): Periodo {
	const meses = MESES_DO_CICLO[config.regime];
	const inicio = somarMeses(config.inicio, n * meses);
	return { inicio, fim: vespera(somarMeses(config.inicio, (n + 1) * meses)) };
}

/** Ciclos do início do banco até o que contém `ate` (inclusive). Vazio se `ate` é anterior ao início. */
export function ciclosAte(config: ConfigBanco, ate: Dia): Periodo[] {
	const ciclos: Periodo[] = [];
	for (let n = 0; ; n++) {
		const c = cicloN(config, n);
		if (c.inicio > ate) break;
		ciclos.push(c);
	}
	return ciclos;
}

export interface MovimentoBanco {
	dia: Dia;
	creditoMin: number;
	debitoMin: number;
	/** Folga compensatória que consumiu saldo. */
	folgaMin: number;
	ocorrencia: string;
}

/** Movimento do dia no banco (`null` se o dia não mexe no saldo). */
export function movimentoDoDia(d: DiaEspelho): MovimentoBanco | null {
	const creditoMin = d.extraMin;
	// Falta fica fora do banco; nos outros dias o déficit já é 0 quando há ausência.
	const debitoMin = d.falta ? 0 : d.deficitMin;
	const folgaMin = d.ausenciaTipo === 'folga' ? (d.contratualMin ?? 0) : 0;
	if (creditoMin === 0 && debitoMin === 0 && folgaMin === 0) return null;
	return { dia: d.dia, creditoMin, debitoMin, folgaMin, ocorrencia: d.ocorrencia };
}

export type ResultadoCiclo = 'pagar' | 'zerado' | 'descontar' | 'quitado';

export interface CicloBanco extends Periodo {
	creditoMin: number;
	debitoMin: number;
	folgaMin: number;
	/** crédito − débito − folga. */
	saldoMin: number;
	/** O ciclo terminou antes de hoje: o saldo venceu. */
	encerrado: boolean;
	/** Só nos encerrados: o que aconteceu com o saldo no vencimento. */
	resultado: ResultadoCiclo | null;
	/** Minutos a pagar ou a descontar (sempre positivo). */
	resultadoMin: number;
	movimentos: MovimentoBanco[];
}

/**
 * Fecha um ciclo a partir dos dias apurados. Considera só os dias do ciclo até
 * ontem: o dia corrente ainda está em andamento.
 */
export function montarCiclo(
	ciclo: Periodo,
	dias: DiaEspelho[],
	hoje: Dia,
	negativo: DestinoNegativo
): CicloBanco {
	const movimentos = dias
		.filter((d) => d.dia >= ciclo.inicio && d.dia <= ciclo.fim && d.dia < hoje)
		.map(movimentoDoDia)
		.filter((m): m is MovimentoBanco => m !== null);

	const soma = (campo: 'creditoMin' | 'debitoMin' | 'folgaMin') =>
		movimentos.reduce((t, m) => t + m[campo], 0);
	const creditoMin = soma('creditoMin');
	const debitoMin = soma('debitoMin');
	const folgaMin = soma('folgaMin');
	const saldoMin = creditoMin - debitoMin - folgaMin;
	const encerrado = ciclo.fim < hoje;

	let resultado: ResultadoCiclo | null = null;
	if (encerrado) {
		if (saldoMin > 0) resultado = 'pagar';
		else if (saldoMin < 0) resultado = negativo === 'zerar' ? 'zerado' : 'descontar';
		else resultado = 'quitado';
	}

	return {
		...ciclo,
		creditoMin,
		debitoMin,
		folgaMin,
		saldoMin,
		encerrado,
		resultado,
		resultadoMin: encerrado ? Math.abs(saldoMin) : 0,
		movimentos
	};
}
