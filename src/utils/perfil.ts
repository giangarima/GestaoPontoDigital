/**
 * @module utils/perfil
 * @description Textos do perfil do colaborador: minutos legíveis, variação contra
 * o período anterior e rótulos dos pontos da série.
 */

/** "25 min", "1h05", "−2h10" (sinal só quando pedido). */
export function formatMinutos(min: number, comSinal = false): string {
	const sinal = comSinal ? (min > 0 ? '+' : min < 0 ? '−' : '') : min < 0 ? '−' : '';
	const abs = Math.abs(Math.round(min));
	if (abs < 60) return `${sinal}${abs} min`;
	return `${sinal}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, '0')}`;
}

export type Sentido = 'melhor' | 'pior' | 'igual';

export interface Variacao {
	/** "+3", "−12,5 p.p.", "+8 min". */
	texto: string;
	sentido: Sentido;
}

/**
 * Variação do período atual contra o anterior. `null` quando falta um dos lados
 * (período anterior sem dado não vira "+100%"). `menorEhMelhor` define a cor:
 * faltas que caem são melhora; pontualidade que cai é piora.
 */
export function variacao(
	atual: number | null,
	anterior: number | null,
	opcoes: { menorEhMelhor: boolean; unidade?: 'pp' | 'min' | '' }
): Variacao | null {
	if (atual === null || anterior === null) return null;
	const diff = Math.round((atual - anterior) * 10) / 10;
	const sentido: Sentido =
		diff === 0 ? 'igual' : diff < 0 === opcoes.menorEhMelhor ? 'melhor' : 'pior';
	const sinal = diff > 0 ? '+' : diff < 0 ? '−' : '';
	const numero = Math.abs(diff).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
	const unidade = opcoes.unidade ?? '';
	let texto: string;
	if (unidade === 'min') texto = formatMinutos(diff, true);
	else if (unidade === 'pp') texto = `${sinal}${numero} p.p.`;
	else texto = `${sinal}${numero}`;
	return { texto: diff === 0 ? 'igual' : texto, sentido };
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "mar/26" para mês; "05/01" (segunda da semana) para semana. */
export function rotuloSerie(chave: string, granularidade: 'semana' | 'mes'): string {
	if (granularidade === 'mes') {
		const [ano, mes] = chave.split('-');
		return `${MESES[Number(mes) - 1]}/${ano.slice(2)}`;
	}
	const [, mes, dia] = chave.split('-');
	return `${dia}/${mes}`;
}

/** "05/01/2026" a partir de "2026-01-05". */
export function formatDia(dia: string): string {
	const [ano, mes, d] = dia.split('-');
	return `${d}/${mes}/${ano}`;
}
