/**
 * @module lib/server/atestado/pdf
 * @description Desenha o Atestado Técnico e Termo de Responsabilidade (art. 89)
 * em PDF A4 com pdf-lib, no layout do modelo oficial: uma página por atestado.
 *
 * As linhas dos responsáveis (legal e técnico) saem em branco: o §2º exige
 * assinatura eletrônica qualificada (ICP-Brasil) de cada pessoa física, feita
 * por eles fora do sistema (e-CPF). Devolve o `PDFDocument` aberto para o
 * chamador aplicar a assinatura de demonstração do sistema, quando houver.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { PTRP_NOME } from '@/lib/server/afd/config';
import { dataHoraBr, quebrarTexto, seguro } from '@/lib/server/pdf/formatar';
import {
	camposAssinaturaRepC,
	camposAtestado,
	camposDestinataria,
	declaracaoAtestado,
	TERMO_RESPONSABILIDADE,
	TITULO_ATESTADO,
	type AtestadoEntrada
} from './montar';

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 56;
const LARGURA = A4[0] - 2 * MARGEM;
const CINZA = rgb(0.4, 0.4, 0.4);
const PRETO = rgb(0, 0, 0);

export const AVISO_ASSINATURA_DEMO =
	'Assinatura digital de demonstração, feita com o certificado do sistema. Ela NÃO substitui a ' +
	'assinatura eletrônica qualificada (ICP-Brasil) do responsável legal e do responsável técnico, ' +
	'exigida pelo art. 89, § 2º, da Portaria MTP nº 671/2021.';

interface Fontes {
	normal: PDFFont;
	negrito: PDFFont;
}

function paragrafo(
	page: PDFPage,
	texto: string,
	y: number,
	fonte: PDFFont,
	tamanho: number,
	opcoes: { recuo?: number; cor?: ReturnType<typeof rgb>; entrelinha?: number } = {}
): number {
	const { recuo = 0, cor = PRETO, entrelinha = tamanho * 1.45 } = opcoes;
	const linhas = quebrarTexto(texto, fonte, tamanho, LARGURA - recuo);
	linhas.forEach((linha, i) => {
		page.drawText(linha, {
			x: MARGEM + (i === 0 ? recuo : 0),
			y: y - i * entrelinha,
			size: tamanho,
			font: fonte,
			color: cor
		});
	});
	return y - linhas.length * entrelinha;
}

function campos(
	page: PDFPage,
	lista: [string, string][],
	y: number,
	{ normal, negrito }: Fontes
): number {
	for (const [rotulo, valor] of lista) {
		const r = seguro(`${rotulo}: `);
		page.drawText(r, { x: MARGEM, y, size: 10, font: negrito });
		const x = MARGEM + negrito.widthOfTextAtSize(r, 10);
		const linhas = quebrarTexto(valor, normal, 10, MARGEM + LARGURA - x);
		linhas.forEach((l, i) => page.drawText(l, { x, y: y - i * 13, size: 10, font: normal }));
		y -= Math.max(1, linhas.length) * 13 + 3;
	}
	return y;
}

function linhaAssinatura(page: PDFPage, y: number, legenda: string, fonte: PDFFont): void {
	const largura = 300;
	const x = MARGEM + (LARGURA - largura) / 2;
	page.drawLine({ start: { x, y }, end: { x: x + largura, y }, thickness: 0.7, color: PRETO });
	const w = fonte.widthOfTextAtSize(legenda, 9.5);
	page.drawText(legenda, { x: MARGEM + (LARGURA - w) / 2, y: y - 13, size: 9.5, font: fonte });
}

function desenharPagina(
	doc: PDFDocument,
	e: AtestadoEntrada,
	fontes: Fontes,
	emitidoEm: Date,
	assinadoDemo: boolean
): void {
	const page = doc.addPage(A4);
	const { normal, negrito } = fontes;
	let y = A4[1] - MARGEM - 10;

	const titulo = seguro(TITULO_ATESTADO);
	const wTitulo = negrito.widthOfTextAtSize(titulo, 13);
	page.drawText(titulo, { x: MARGEM + (LARGURA - wTitulo) / 2, y, size: 13, font: negrito });
	y -= 34;

	y = paragrafo(page, declaracaoAtestado(e), y, normal, 10.5, { recuo: 28 }) - 14;
	y = campos(page, camposAtestado(e), y, fontes) - 6;

	page.drawText('Assinatura Eletrônica (somente REP-C):', {
		x: MARGEM,
		y,
		size: 10,
		font: negrito
	});
	y -= 16;
	y = campos(page, camposAssinaturaRepC(), y, fontes) - 14;

	y = paragrafo(page, TERMO_RESPONSABILIDADE, y, normal, 10.5, { recuo: 28 }) - 16;

	page.drawText('Empresa/Pessoa Destinatária:', { x: MARGEM, y, size: 10, font: negrito });
	y -= 16;
	y = campos(page, camposDestinataria(e), y, fontes);

	// Responsáveis em branco: preenchidos e assinados (e-CPF) por eles.
	y -= 70;
	linhaAssinatura(page, y, 'Nome e CPF do Responsável Legal', normal);
	y -= 70;
	linhaAssinatura(page, y, 'Nome e CPF do Responsável Técnico', normal);

	if (assinadoDemo) {
		paragrafo(page, AVISO_ASSINATURA_DEMO, MARGEM + 22, normal, 7.5, { cor: rgb(0.6, 0.35, 0) });
	}
	page.drawText(seguro(`${PTRP_NOME} - emitido em ${dataHoraBr(emitidoEm)}`), {
		x: MARGEM,
		y: MARGEM - 14,
		size: 7.5,
		font: normal,
		color: CINZA
	});
}

export async function desenharAtestadoPdf(
	atestados: AtestadoEntrada[],
	opcoes: { emitidoEm?: Date; assinadoDemo: boolean }
): Promise<PDFDocument> {
	const doc = await PDFDocument.create();
	const fontes = {
		normal: await doc.embedFont(StandardFonts.Helvetica),
		negrito: await doc.embedFont(StandardFonts.HelveticaBold)
	};
	const emitidoEm = opcoes.emitidoEm ?? new Date();

	doc.setTitle('Atestado Técnico e Termo de Responsabilidade');
	doc.setSubject('Portaria MTP 671/2021, art. 89');
	doc.setAuthor(seguro(atestados[0]?.desenvolvedora.razaoSocial ?? PTRP_NOME));
	doc.setCreator(seguro(PTRP_NOME));
	doc.setProducer(seguro(PTRP_NOME));
	doc.setCreationDate(emitidoEm);

	for (const e of atestados) desenharPagina(doc, e, fontes, emitidoEm, opcoes.assinadoDemo);
	return doc;
}
