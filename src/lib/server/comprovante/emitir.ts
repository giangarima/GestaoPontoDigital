import { prisma } from '@/lib/server/db';
import { PDFDocument } from 'pdf-lib';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { SUBFILTER_ETSI_CADES_DETACHED } from '@signpdf/utils';
import type { ComprovanteData } from './types';
import buildComprovanteData from './build-data';
import {
	renderHtmlComprovante,
	renderEmailHtmlComprovante,
	renderEmailTextComprovante
} from './template-html';
import htmlToPdf from './generate-pdf';
import signPdf from './sign-pdf';
import { salvarComprovantePdf } from './storage';
import { sendComprovanteEmail } from '@/lib/server/mailer';
import type { Prisma } from '@/lib/server/prisma-client/client';

type ComprovanteSelecionado = Prisma.ComprovanteGetPayload<{
	select: { registroId: true; envioStatus: true; id: true };
}>;

type ComprovanteCreateInput = Prisma.ComprovanteUncheckedCreateInput;

function toEmailData(data: ComprovanteData): ComprovanteData {
	return data;
}

export async function emitirComprovante(registroId: string): Promise<void> {
	try {
		const existente = (await prisma.comprovante.findUnique({
			where: { registroId },
			select: { id: true, registroId: true, envioStatus: true }
		})) as ComprovanteSelecionado | null;
		if (existente && existente.envioStatus === 'enviado') return;

		const data = await buildComprovanteData(registroId);
		// build email/html
		data.emailHtml = renderEmailHtmlComprovante(toEmailData(data));
		data.emailText = renderEmailTextComprovante(toEmailData(data));

		const html = renderHtmlComprovante(toEmailData(data));
		const pdfRaw = await htmlToPdf(html);

		const pdfDoc = await PDFDocument.load(pdfRaw);
		pdflibAddPlaceholder({
			pdfDoc,
			reason: `Comprovante de registro de ponto - ${data.colaboradorNome}`,
			contactInfo: data.colaboradorEmail,
			name: data.colaboradorNome,
			location: data.empresaNome,
			subFilter: SUBFILTER_ETSI_CADES_DETACHED
		});

		const pdfWithPlaceholder = Buffer.from(await pdfDoc.save());
		const { buffer: pdfSigned, hashSha256 } = await signPdf(pdfWithPlaceholder);

		const stored = await salvarComprovantePdf(String(data.empresaId), data.nsrFormatado, pdfSigned);

		// upsert comprovante row (if model exists)
		const upsertPayload: ComprovanteCreateInput = {
			registroId,
			empresaId: data.empresaId,
			colaboradorId: data.colaboradorId,
			nsr: BigInt(data.nsr),
			caminhoArquivo: stored.caminhoRelativo,
			hashSha256,
			envioStatus: 'pendente'
		};

		// attempt upsert if model exists
		try {
			const compro = await prisma.comprovante.upsert({
				where: { registroId },
				create: upsertPayload,
				update: { caminhoArquivo: stored.caminhoRelativo, hashSha256 }
			});

			await sendComprovanteEmail({ to: data.colaboradorEmail, data, pdfBuffer: pdfSigned });

			await prisma.comprovante.update({
				where: { id: compro.id },
				data: { envioStatus: 'enviado', enviadoEm: new Date(), envioErro: null }
			});
		} catch (error: unknown) {
			// if comprovante model doesn't exist, just send the email and log
			await sendComprovanteEmail({ to: data.colaboradorEmail, data, pdfBuffer: pdfSigned });
			if (process.env.NODE_ENV !== 'production') {
				console.warn('[comprovante] upsert falhou, seguindo com envio do e-mail', error);
			}
		}
	} catch (error: unknown) {
		console.error('[comprovante] falha ao emitir', registroId, error);
		try {
			await prisma.comprovante.updateMany({
				where: { registroId },
				data: { envioStatus: 'falha', envioErro: String(error) }
			});
		} catch (updateError: unknown) {
			console.error('[comprovante] falha ao atualizar status para falha', updateError);
		}
	}
}

export default emitirComprovante;
