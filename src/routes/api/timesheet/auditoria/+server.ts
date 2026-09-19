/**
 * @endpoint GET /api/timesheet/auditoria
 * @description Auditoria de integridade do diário de marcações da empresa do admin
 * autenticado — evidência de imutabilidade técnica exigida pela Portaria 671/2021
 * (REP-P). Verifica a hash-chain das batidas e a sequência de NSR (detecta
 * alteração e exclusão, inclusive da última batida e de eventos de cadastro).
 * Retorna `AuditoriaDTO` (ver `lib/server/auditoria.ts`).
 */
import type { RequestHandler } from '@sveltejs/kit';
import { auditarEmpresa } from '@/lib/server/auditoria';
import { requireAdmin, jsonOk } from '../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	return jsonOk(await auditarEmpresa(admin.empresaId));
};
