/**
 * @endpoint GET /api/relatorios/afd
 * @description Gera e baixa o AFD (Arquivo Fonte de Dados, Portaria 671/2021) da
 * empresa do admin autenticado. Query opcional `inicio`/`fim` (YYYY-MM-DD) filtra
 * as marcações; eventos de empregador/empregado entram sempre (contexto do arquivo).
 *
 * Retorna texto (ISO-8859-1) como anexo — NÃO passa pelo api.ts (que só trata JSON).
 */
import type { RequestHandler } from '@sveltejs/kit';
import { gerarAfd } from '@/lib/server/afd/gerar';
import { requireAdmin, jsonError } from '../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request, url }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const inicioParam = url.searchParams.get('inicio');
	const fimParam = url.searchParams.get('fim');
	const inicio = inicioParam ? new Date(`${inicioParam}T00:00:00.000Z`) : undefined;
	const fim = fimParam ? new Date(`${fimParam}T23:59:59.999Z`) : undefined;
	if ((inicio && isNaN(inicio.getTime())) || (fim && isNaN(fim.getTime()))) {
		return jsonError('inicio/fim inválidos (use YYYY-MM-DD)', 400);
	}

	const { conteudo, nome } = await gerarAfd(admin.empresaId, { inicio, fim });

	// Cast: Uint8Array é um corpo válido em runtime; o tipo BodyInit do lib atual
	// não aceita Uint8Array<ArrayBufferLike> (fricção conhecida do TS).
	return new Response(conteudo as unknown as BodyInit, {
		status: 200,
		headers: {
			'Content-Type': 'text/plain; charset=iso-8859-1',
			'Content-Disposition': `attachment; filename="${nome}"`
		}
	});
};
