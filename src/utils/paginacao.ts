/**
 * @module utils/paginacao
 * @description Cálculos puros da paginação de listas (ver `ui/Paginacao.svelte`).
 */

/** Reticência entre blocos de páginas distantes. */
export const ELIPSE = '…' as const;

export type ItemPaginacao = number | typeof ELIPSE;

/** Quantas páginas cabem `total` itens. Lista vazia ainda é uma página. */
export function totalDePaginas(total: number, porPagina: number): number {
	if (porPagina <= 0) return 1;
	return Math.max(1, Math.ceil(total / porPagina));
}

/** Intervalo 1-based exibido na página (`[0, 0]` quando a lista está vazia). */
export function intervaloDaPagina(
	pagina: number,
	total: number,
	porPagina: number
): [primeiro: number, ultimo: number] {
	if (total === 0) return [0, 0];
	return [(pagina - 1) * porPagina + 1, Math.min(pagina * porPagina, total)];
}

/** Mantém a página dentro de 1..totalPaginas — a lista encolhe com busca e filtro. */
export function paginaValida(pagina: number, totalPaginas: number): number {
	if (!Number.isFinite(pagina)) return 1;
	return Math.min(Math.max(1, Math.trunc(pagina)), totalPaginas);
}

/**
 * Números a exibir na barra: primeira, última, a atual e as vizinhas; o resto
 * vira reticência, para a barra não crescer junto com o histórico. Até 7
 * páginas cabem todas.
 */
export function numerosDePagina(pagina: number, totalPaginas: number): ItemPaginacao[] {
	if (totalPaginas <= 7) {
		return Array.from({ length: totalPaginas }, (_, i) => i + 1);
	}
	const perto = new Set([1, totalPaginas, pagina, pagina - 1, pagina + 1]);
	const itens: ItemPaginacao[] = [];
	let pulou = false;
	for (let p = 1; p <= totalPaginas; p++) {
		if (perto.has(p)) {
			itens.push(p);
			pulou = false;
		} else if (!pulou) {
			itens.push(ELIPSE);
			pulou = true;
		}
	}
	return itens;
}
