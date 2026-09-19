/**
 * @endpoint GET /api/relatorios/atestado
 * @description Atestado Técnico e Termo de Responsabilidade (Portaria 671/2021,
 * art. 89) em PDF, com a empresa do admin como destinatária. Header
 * `X-Assinatura`: `demonstracao` (assinado com o certificado do sistema) ou
 * `ausente`. A assinatura válida é a qualificada dos responsáveis (e-CPF).
 */
import type { RequestHandler } from '@sveltejs/kit';
import { gerarAtestadoPdf } from '@/lib/server/atestado/gerar';
import { requireAdmin } from '../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const pdf = await gerarAtestadoPdf(admin.empresaId);
	return new Response(pdf.conteudo as unknown as BodyInit, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${pdf.nome}"`,
			'X-Assinatura': pdf.assinado ? 'demonstracao' : 'ausente'
		}
	});
};
