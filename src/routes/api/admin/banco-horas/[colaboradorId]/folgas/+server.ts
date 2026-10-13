/**
 * @endpoint POST /api/admin/banco-horas/:colaboradorId/folgas
 * @description Lança folga compensatória `{ dataInicio, dataFim, motivo }`: uma
 * ausência aprovada do tipo `folga`. No espelho o dia fica abonado; no banco de
 * horas ela consome o contratual de cada dia com expediente.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '@/lib/server/db';
import { STATUS_APROVADA } from '@/lib/server/ausencia';
import { configDoBanco, TIPO_FOLGA } from '@/lib/server/banco-horas/carregar';
import { ausenciaNoPeriodo, dataPura, ehDia } from '@/lib/server/periodo';
import { requireAdmin, jsonError, jsonOk } from '../../../../_lib/auth-helpers';

export const POST: RequestHandler = async ({ request, params }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	let body: { dataInicio?: string; dataFim?: string; motivo?: string };
	try {
		body = await request.json();
	} catch {
		return jsonError('Corpo da requisição inválido', 400);
	}

	const dataFim = body.dataFim || body.dataInicio;
	if (!ehDia(body.dataInicio) || !ehDia(dataFim) || dataFim < body.dataInicio) {
		return jsonError('dataInicio e dataFim (AAAA-MM-dd, fim ≥ início) são obrigatórias', 400);
	}
	if (!(await configDoBanco(admin.empresaId))) {
		return jsonError('A empresa não tem banco de horas configurado', 409);
	}
	const colaborador = await prisma.colaborador.findFirst({
		where: { id: params.colaboradorId, empresaId: admin.empresaId, deletedAt: null },
		select: { id: true }
	});
	if (!colaborador) return jsonError('Colaborador não encontrado', 404);

	// Uma ausência aprovada por dia: sobrepor férias ou atestado embaralharia o abono.
	const sobreposta = await prisma.ausencia.findFirst({
		where: {
			colaboradorId: colaborador.id,
			status: STATUS_APROVADA,
			...ausenciaNoPeriodo(body.dataInicio, dataFim)
		},
		select: { tipo: true }
	});
	if (sobreposta) {
		return jsonError(`Já existe uma ausência aprovada (${sobreposta.tipo}) nesse período`, 409);
	}

	const folga = await prisma.ausencia.create({
		data: {
			empresaId: admin.empresaId,
			colaboradorId: colaborador.id,
			tipo: TIPO_FOLGA,
			dataInicio: dataPura(body.dataInicio),
			dataFim: dataPura(dataFim),
			motivo: body.motivo?.trim() || 'Folga compensatória (banco de horas)',
			status: STATUS_APROVADA,
			revisadoPor: admin.id,
			revisadoEm: new Date()
		}
	});
	return jsonOk({ id: folga.id, dataInicio: body.dataInicio, dataFim, motivo: folga.motivo }, 201);
};
