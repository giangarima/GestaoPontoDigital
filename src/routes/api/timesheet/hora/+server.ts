/**
 * @endpoint GET /api/timesheet/hora
 * @description Instante atual do servidor (o REP-P), para a tela de registro
 * mostrar a hora do REP — e não a do dispositivo do trabalhador. O relógio do
 * servidor é monitorado contra a Hora Legal Brasileira (Admin > Auditoria).
 */
import type { RequestHandler } from '@sveltejs/kit';
import { requireUser, jsonOk } from '../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request }) => {
	try {
		requireUser(request);
	} catch (response) {
		return response as Response;
	}
	return jsonOk({ agoraMs: Date.now() });
};
