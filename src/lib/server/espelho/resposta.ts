/**
 * @module lib/server/espelho/resposta
 * @description Response de download do espelho em PDF. O header
 * `X-Assinatura` avisa o front quando o PDF saiu sem assinatura.
 */
import type { EspelhoPdf } from './gerar';

export function respostaPdf(pdf: EspelhoPdf): Response {
	// Cast: Uint8Array é corpo válido em runtime (mesma fricção de tipo de pacote.ts).
	return new Response(pdf.conteudo as unknown as BodyInit, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${pdf.nome}"`,
			'X-Assinatura': pdf.assinado ? 'pades' : 'ausente'
		}
	});
}
