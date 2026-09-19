/**
 * @module lib/server/pdf/formatar
 * @description Formatação de texto para os PDFs legais (espelho, comprovante)
 * desenhados com pdf-lib e as fontes padrão (Helvetica/Courier, codificação
 * WinAnsi). Datas e horas sempre no fuso de Brasília.
 */
import { toDH } from '@/lib/server/afd/format';

/**
 * Deixa o texto desenhável com as fontes padrão (WinAnsi): pontuação
 * tipográfica vira ASCII e o que sobrar fora do Latin-1 vira "?".
 */
export function seguro(s: string): string {
	return s
		.replace(/[\u2013\u2014]/g, '-')
		.replace(/[\u2018\u2019]/g, "'")
		.replace(/[\u201C\u201D]/g, '"')
		.replace(/\u2026/g, '...')
		.replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, '?');
}

/** "AAAA-MM-dd" → "dd/mm/aaaa". */
export function dataBr(dia: string): string {
	const [a, m, d] = dia.split('-');
	return `${d}/${m}/${a}`;
}

/** "dd/mm/aaaa hh:mm" em Brasília. */
export function dataHoraBr(instante: Date): string {
	const dh = toDH(instante); // AAAA-MM-ddThh:mm:00-0300
	return `${dataBr(dh.slice(0, 10))} ${dh.slice(11, 16)}`;
}

/** "hh:mm" em Brasília. */
export function horaBr(instante: Date): string {
	return toDH(instante).slice(11, 16);
}

export function cpfBr(cpf: string): string {
	const d = cpf.replace(/\D/g, '').padStart(11, '0');
	return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** CNPJ (14 dígitos) ou CPF (11) formatado; "-" quando vazio. */
export function inscricaoBr(v: string | null | undefined): string {
	const d = (v ?? '').replace(/\D/g, '');
	if (d.length === 14)
		return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
	if (d.length === 11) return cpfBr(d);
	return d || '-';
}

/** Quebra `texto` em linhas que caibam em `largura` (pt) na fonte e tamanho dados. */
export function quebrarTexto(
	texto: string,
	fonte: { widthOfTextAtSize(texto: string, tamanho: number): number },
	tamanho: number,
	largura: number
): string[] {
	const linhas: string[] = [];
	let atual = '';
	for (const palavra of seguro(texto).split(/\s+/).filter(Boolean)) {
		const tentativa = atual ? `${atual} ${palavra}` : palavra;
		if (!atual || fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) atual = tentativa;
		else {
			linhas.push(atual);
			atual = palavra;
		}
	}
	if (atual) linhas.push(atual);
	return linhas;
}
