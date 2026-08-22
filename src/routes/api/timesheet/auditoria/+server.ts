/**
 * @endpoint GET /api/timesheet/auditoria
 * @description Verifica a integridade da cadeia de batidas (NSR + hash-chain) da
 * empresa do admin autenticado — evidência de imutabilidade técnica exigida pela
 * Portaria 671/2021 (REP-P). Retorna o total, se a cadeia está íntegra e, em caso
 * de adulteração, o primeiro NSR onde a cadeia quebrou.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { verificarCadeia } from '@/lib/server/registro-ledger';
import { requireAdmin, jsonOk } from '../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const resultado = await verificarCadeia(admin.empresaId);
	return jsonOk(resultado);
};
