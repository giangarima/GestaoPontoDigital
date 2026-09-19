/**
 * @module lib/server/comprovante/emitir
 * @description Comprovante de Registro de Ponto do Trabalhador (Portaria
 * 671/2021, arts. 79 e 80): gera o PDF assinado, guarda e envia por e-mail
 * após cada marcação original do REP.
 *
 * O arquivo guardado em disco é um cache: no Render o disco é efêmero (some a
 * cada deploy). `obterComprovantePdf` regera o comprovante a partir do banco
 * quando o arquivo não existe — o conteúdo (NSR, hash, horário…) é o mesmo;
 * muda só o instante da assinatura.
 */
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { prisma } from '@/lib/server/db';
import { finalizarPdf, podeAssinarPdf } from '@/lib/server/assinatura/pdf';
import { sendComprovanteEmail } from '@/lib/server/mailer';
import buildComprovanteData from './build-data';
import { desenharComprovantePdf } from './pdf';
import { renderEmailHtmlComprovante, renderEmailTextComprovante } from './template-html';
import { lerComprovantePdf, salvarComprovantePdf } from './storage';
import type { ComprovanteData } from './types';

interface ComprovanteGerado {
	data: ComprovanteData;
	pdf: Buffer;
	hashSha256: string;
	caminhoArquivo: string;
}

/** Gera o PDF (assinado quando há certificado), salva e registra na tabela. */
async function gerarESalvar(registroId: string): Promise<ComprovanteGerado> {
	const data = await buildComprovanteData(registroId);
	const doc = await desenharComprovantePdf(data, { assinado: podeAssinarPdf() });
	const { conteudo } = await finalizarPdf(doc, {
		motivo: `Comprovante de registro de ponto - ${data.colaboradorNome}`,
		nome: data.colaboradorNome,
		local: data.empresaNome,
		contato: data.colaboradorEmail
	});
	const pdf = Buffer.from(conteudo);
	const hashSha256 = createHash('sha256').update(pdf).digest('hex');
	const { caminhoRelativo } = await salvarComprovantePdf(data.empresaId, data.nsrFormatado, pdf);

	await prisma.comprovante.upsert({
		where: { registroId },
		create: {
			registroId,
			empresaId: data.empresaId,
			colaboradorId: data.colaboradorId,
			nsr: BigInt(data.nsr),
			caminhoArquivo: caminhoRelativo,
			hashSha256,
			envioStatus: 'pendente'
		},
		update: { caminhoArquivo: caminhoRelativo, hashSha256 }
	});
	return { data, pdf, hashSha256, caminhoArquivo: caminhoRelativo };
}

/**
 * Emite o comprovante de uma marcação e envia por e-mail. Chamado sem `await`
 * após a batida: falhas são registradas em `comprovantes.envio_status`, nunca
 * propagadas para a marcação (que já foi gravada).
 */
export async function emitirComprovante(registroId: string): Promise<void> {
	try {
		const existente = await prisma.comprovante.findUnique({
			where: { registroId },
			select: { envioStatus: true }
		});
		if (existente?.envioStatus === 'enviado') return;

		const { data, pdf } = await gerarESalvar(registroId);
		data.emailHtml = renderEmailHtmlComprovante(data);
		data.emailText = renderEmailTextComprovante(data);
		await sendComprovanteEmail({ to: data.colaboradorEmail, data, pdfBuffer: pdf });

		await prisma.comprovante.update({
			where: { registroId },
			data: { envioStatus: 'enviado', enviadoEm: new Date(), envioErro: null }
		});
	} catch (error: unknown) {
		console.error('[comprovante] falha ao emitir', registroId, error);
		await prisma.comprovante
			.updateMany({
				where: { registroId },
				data: { envioStatus: 'falha', envioErro: String(error) }
			})
			.catch((e: unknown) => console.error('[comprovante] falha ao registrar erro', e));
	}
}

/**
 * PDF do comprovante para download (art. 80, parágrafo único, II e III): o
 * arquivo guardado ou, se ele não existe mais, um regerado a partir do banco.
 */
export async function obterComprovantePdf(
	registroId: string
): Promise<{ pdf: Buffer; nome: string }> {
	const salvo = await prisma.comprovante.findUnique({ where: { registroId } });
	if (salvo && existsSync(path.resolve(process.cwd(), salvo.caminhoArquivo))) {
		const nome = path.basename(salvo.caminhoArquivo);
		return { pdf: await lerComprovantePdf(salvo.caminhoArquivo), nome };
	}
	const { pdf, data } = await gerarESalvar(registroId);
	return { pdf, nome: data.nomeArquivo };
}

export default emitirComprovante;
