/**
 * @module lib/server/assinatura/pdf
 * @description Assinatura PAdES (`ETSI.CAdES.detached`) dos PDFs gerados com
 * pdf-lib: comprovante de marcação (art. 80, obrigatória) e espelho de ponto
 * (opcional). Usa o mesmo certificado do REP (ver `certificado.ts`).
 */
import type { PDFDocument } from 'pdf-lib';
import { SUBFILTER_ETSI_CADES_DETACHED } from '@signpdf/utils';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import signPdf from '@/lib/server/comprovante/sign-pdf';
import { lerCertificadoP12 } from './certificado';

/** Há certificado para assinar? (desligado com `COMPROVANTE_SKIP_SIGN=true`) */
export function podeAssinarPdf(): boolean {
	return process.env.COMPROVANTE_SKIP_SIGN !== 'true' && lerCertificadoP12() !== null;
}

export interface PdfFinal {
	conteudo: Uint8Array;
	assinado: boolean;
}

/** Salva o PDF, assinado em PAdES quando `podeAssinarPdf()`. */
export async function finalizarPdf(
	doc: PDFDocument,
	info: { motivo: string; nome: string; local: string; contato?: string }
): Promise<PdfFinal> {
	if (!podeAssinarPdf()) return { conteudo: await doc.save(), assinado: false };

	pdflibAddPlaceholder({
		pdfDoc: doc,
		reason: info.motivo,
		contactInfo: info.contato ?? '',
		name: info.nome,
		location: info.local,
		subFilter: SUBFILTER_ETSI_CADES_DETACHED
	});
	const { buffer } = await signPdf(Buffer.from(await doc.save()));
	return { conteudo: new Uint8Array(buffer), assinado: true };
}
