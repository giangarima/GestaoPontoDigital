/**
 * @module lib/server/comprovante/pdf
 * @description Comprovante de Registro de Ponto do Trabalhador em PDF (Portaria
 * 671/2021, arts. 79 e 80) com pdf-lib — sem navegador headless.
 *
 * `camposComprovante` (pura) decide O QUE sai no documento, na ordem dos
 * incisos do art. 79; `desenharComprovantePdf` só desenha. Devolve o
 * `PDFDocument` aberto para o chamador incluir o placeholder da assinatura
 * PAdES (art. 80, parágrafo único, I) antes de salvar.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PTRP_NOME } from '@/lib/server/afd/config';
import { dataHoraBr, seguro } from '@/lib/server/pdf/formatar';
import type { ComprovanteData } from './types';

export interface SecaoComprovante {
	titulo: string;
	campos: [rotulo: string, valor: string][];
}

/** Título exigido pelo art. 79, I. */
export const TITULO_COMPROVANTE = 'Comprovante de Registro de Ponto do Trabalhador';

/** Conteúdo do comprovante, na ordem do art. 79 (I a VIII). */
export function camposComprovante(d: ComprovanteData): SecaoComprovante[] {
	const empregador: [string, string][] = [
		['Nome', d.empresaNome],
		['CNPJ/CPF', d.empresaCnpj ?? '-'],
		['CAEPF/CNO', d.empresaCaepfCno ?? '-']
	];
	if (d.localPrestacao) empregador.push(['Local', d.localPrestacao]);

	return [
		{ titulo: 'Marcação', campos: [['NSR', d.nsrFormatado]] },
		{ titulo: 'Empregador', campos: empregador },
		{
			titulo: 'Trabalhador',
			campos: [
				['Nome', d.colaboradorNome],
				['CPF', d.colaboradorCpf]
			]
		},
		{
			titulo: 'Registro',
			campos: [
				['Data', d.data],
				['Horário', d.hora],
				['Tipo', d.tipoLabel]
			]
		},
		{ titulo: 'REP-P', campos: [['Registro no INPI', d.repInpi]] },
		{ titulo: 'Código hash (SHA-256) da marcação', campos: [['', d.hashMarcacao]] }
	];
}

// A5 retrato: cabe inteiro numa tela de celular.
const PAGINA: [number, number] = [419.53, 595.28];
const MARGEM = 32;
const LARGURA = PAGINA[0] - 2 * MARGEM;
const CINZA = rgb(0.4, 0.4, 0.4);
const LINHA = rgb(0.82, 0.82, 0.82);

export interface OpcoesDesenho {
	emitidoEm?: Date;
	/** O chamador vai assinar o PDF (PAdES)? Muda só a nota de rodapé. */
	assinado: boolean;
}

export async function desenharComprovantePdf(
	d: ComprovanteData,
	{ emitidoEm = new Date(), assinado }: OpcoesDesenho
): Promise<PDFDocument> {
	const doc = await PDFDocument.create();
	const normal = await doc.embedFont(StandardFonts.Helvetica);
	const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
	const mono = await doc.embedFont(StandardFonts.Courier);
	const page = doc.addPage(PAGINA);

	doc.setTitle(seguro(`${TITULO_COMPROVANTE} - NSR ${d.nsrFormatado}`));
	doc.setAuthor(seguro(d.empresaNome));
	doc.setSubject('Portaria MTP 671/2021, art. 79');
	doc.setCreator(seguro(PTRP_NOME));
	doc.setProducer(seguro(PTRP_NOME));
	doc.setCreationDate(emitidoEm);

	let y = PAGINA[1] - MARGEM;

	// I — título
	page.drawText(seguro(TITULO_COMPROVANTE), { x: MARGEM, y: y - 13, size: 12.5, font: negrito });
	y -= 24;
	page.drawLine({
		start: { x: MARGEM, y },
		end: { x: MARGEM + LARGURA, y },
		thickness: 1,
		color: rgb(0, 0, 0)
	});
	y -= 14;

	for (const secao of camposComprovante(d)) {
		page.drawText(seguro(secao.titulo.toUpperCase()), {
			x: MARGEM,
			y: y - 8,
			size: 7.5,
			font: negrito,
			color: CINZA
		});
		y -= 20;

		for (const [rotulo, valor] of secao.campos) {
			if (secao.titulo.startsWith('Código hash')) {
				// 64 hex em 2 linhas de 32, em fonte monoespaçada.
				for (const parte of [valor.slice(0, 32), valor.slice(32)]) {
					page.drawText(parte, { x: MARGEM, y, size: 10.5, font: mono });
					y -= 14;
				}
				continue;
			}
			const destaque = rotulo === 'NSR';
			page.drawText(seguro(`${rotulo}:`), { x: MARGEM, y, size: 9, font: normal, color: CINZA });
			page.drawText(seguro(valor), {
				x: MARGEM + 92,
				y,
				size: destaque ? 13 : 9.5,
				font: destaque ? mono : negrito,
				maxWidth: LARGURA - 92
			});
			y -= destaque ? 17 : 14;
		}

		y -= 4;
		page.drawLine({
			start: { x: MARGEM, y },
			end: { x: MARGEM + LARGURA, y },
			thickness: 0.5,
			color: LINHA
		});
		y -= 12;
	}

	const notas = [
		'Horário registrado pelo servidor do REP-P no fuso de Brasília.',
		'O código hash acima é o mesmo do registro tipo "7" desta marcação no AFD.',
		assinado
			? 'Documento assinado eletronicamente (PAdES) - Portaria MTP 671/2021, arts. 79 e 80.'
			: 'Documento SEM assinatura eletrônica: certificado do REP não configurado.',
		`Emitido em ${dataHoraBr(emitidoEm)}.`
	];
	for (const nota of notas) {
		page.drawText(seguro(nota), { x: MARGEM, y, size: 7, font: normal, color: CINZA });
		y -= 10;
	}

	return doc;
}
