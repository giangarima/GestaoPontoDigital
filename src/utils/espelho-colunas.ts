/**
 * @module utils/espelho-colunas
 * @description Distribui as batidas de um dia nas colunas do espelho de Ajustes.
 *
 * A apuração forma os pares por ordem (`apuracao.ts`), e a grade segue o rótulo
 * gravado só quando ele é coerente (`colunasDoDia`); senão, vale a posição.
 * Agrupar sempre por `type` escondia batidas com rótulo repetido e tudo depois da 4ª.
 */

export interface BatidaColuna {
	id: string;
	/** Rótulo gravado (`entrada`, `saida_almoco`…). Decide a coluna quando é coerente. */
	type: string;
	timestamp: string;
	anulacao: { registroSubstitutoId: string | null } | null;
}

/** Uma célula: a batida válida da posição e as desconsideradas que ficam junto dela. */
export interface Celula<T extends BatidaColuna> {
	valida: T | null;
	anuladas: T[];
}

const porHora = <T extends BatidaColuna>(a: T, b: T) => a.timestamp.localeCompare(b.timestamp);

/**
 * Visão com ajustes: uma célula por batida válida, em ordem. Cada desconsiderada vai
 * para a célula da batida que a substituiu (ajuste) ou, se avulsa, para a da próxima
 * válida no horário — assim ela não ocupa posição nem desloca os pares. Desconsiderada
 * depois da última válida ganha uma célula própria no fim.
 */
export function celulasComAjustes<T extends BatidaColuna>(registros: T[]): Celula<T>[] {
	const validas = registros.filter((r) => !r.anulacao).sort(porHora);
	const celulas: Celula<T>[] = validas.map((v) => ({ valida: v, anuladas: [] }));
	const sobra: T[] = [];
	for (const a of registros.filter((r) => r.anulacao).sort(porHora)) {
		const substituta = a.anulacao!.registroSubstitutoId;
		let i = substituta ? validas.findIndex((v) => v.id === substituta) : -1;
		if (i < 0) i = validas.findIndex((v) => v.timestamp >= a.timestamp);
		if (i >= 0) celulas[i].anuladas.push(a);
		else sobra.push(a);
	}
	if (sobra.length > 0) celulas.push({ valida: null, anuladas: sobra });
	return celulas;
}

/** Visão do colaborador: as marcações originais em ordem, uma por célula (anuladas inclusive). */
export function celulasOriginais<T extends BatidaColuna & { createdBy: string | null }>(
	registros: T[]
): Celula<T>[] {
	return registros
		.filter((r) => r.createdBy == null)
		.sort(porHora)
		.map((r) => ({ valida: r, anuladas: [] }));
}

/** Coluna de cada um dos quatro rótulos padrão. */
const COLUNA_DO_TIPO: Record<string, number> = {
	entrada: 0,
	saida_almoco: 1,
	retorno_almoco: 2,
	saida: 3
};

/**
 * Distribui as células do dia em `total` colunas (`null` = coluna vazia).
 *
 * Quando os rótulos são coerentes — até 4 células, cada uma com um rótulo padrão
 * diferente e em ordem crescente de horário — cada uma vai para a coluna do seu
 * rótulo: o admin que corrige a última batida para "Saída 2" a vê em Saída 2, e o
 * buraco em Entrada 2 fica à mostra. Fora disso (rótulo repetido, mais de 4
 * batidas, fora de ordem), vale a posição, como na apuração.
 */
export function colunasDoDia<T extends BatidaColuna>(
	celulas: Celula<T>[],
	total: number
): (Celula<T> | null)[] {
	const out: (Celula<T> | null)[] = Array.from({ length: total }, () => null);
	const porTipo: number[] = [];
	let anterior = -1;
	let coerente = celulas.length <= 4;
	for (const c of celulas) {
		if (!coerente) break;
		const col = c.valida ? COLUNA_DO_TIPO[c.valida.type] : anterior + 1;
		if (col === undefined || col <= anterior || col > 3) coerente = false;
		else porTipo.push((anterior = col));
	}
	celulas.forEach((c, i) => {
		const col = coerente ? porTipo[i] : i;
		if (col < total) out[col] = c;
	});
	return out;
}

/** Colunas da grade: no mínimo 4 e sempre em pares (entrada/saída). */
export function totalDeColunas(maiorDia: number): number {
	return Math.max(4, maiorDia + (maiorDia % 2));
}

/** "Entrada 1", "Saída 1", "Entrada 2"… */
export function rotuloColuna(i: number): string {
	return `${i % 2 === 0 ? 'Entrada' : 'Saída'} ${Math.floor(i / 2) + 1}`;
}
