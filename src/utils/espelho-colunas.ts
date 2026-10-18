/**
 * @module utils/espelho-colunas
 * @description Distribui as batidas de um dia nas colunas do espelho de Ajustes.
 *
 * A coluna é a **posição** da batida, não o `type` gravado: a apuração forma os pares
 * por ordem (`apuracao.ts`), então a 2ª válida é a "Saída 1" seja qual for o rótulo.
 * Agrupar por `type` escondia batidas com rótulo repetido e tudo depois da 4ª.
 */

export interface BatidaColuna {
	id: string;
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

/** Colunas da grade: no mínimo 4 e sempre em pares (entrada/saída). */
export function totalDeColunas(maiorDia: number): number {
	return Math.max(4, maiorDia + (maiorDia % 2));
}

/** "Entrada 1", "Saída 1", "Entrada 2"… */
export function rotuloColuna(i: number): string {
	return `${i % 2 === 0 ? 'Entrada' : 'Saída'} ${Math.floor(i / 2) + 1}`;
}
