/**
 * Extrai o texto desenhado num PDF do pdf-lib (operadores `<hex> Tj` dos
 * content streams, comprimidos ou não) — só para os testes conferirem o que
 * saiu no documento sem depender do pdftotext.
 */
import { inflateSync } from 'node:zlib';

export function textoDoPdf(pdf: Uint8Array): string {
	const bruto = Buffer.from(pdf).toString('latin1');
	const partes: string[] = [];
	for (const m of bruto.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
		const dados = Buffer.from(m[1], 'latin1');
		let conteudo: string;
		try {
			conteudo = inflateSync(dados).toString('latin1');
		} catch {
			conteudo = m[1];
		}
		for (const tj of conteudo.matchAll(/<([0-9A-Fa-f]*)> Tj/g)) {
			partes.push(Buffer.from(tj[1], 'hex').toString('latin1'));
		}
	}
	return partes.join('\n');
}
