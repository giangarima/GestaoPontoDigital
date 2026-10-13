import type { RequestHandler } from '@sveltejs/kit';
import { toEmpresaDTO } from '@/lib/server/empresa';
import { prisma } from '@/lib/server/db';
import { registrarEventoEmpregador } from '@/lib/server/registro-ledger';
import { isValidCnpj } from '@/utils/validators';
import {
	DESTINOS_NEGATIVO,
	REGIMES,
	type DestinoNegativo,
	type RegimeBanco
} from '@/lib/server/banco-horas/montar';
import { dataPura, ehDia } from '@/lib/server/periodo';
import { requireAdmin, jsonError, jsonOk } from '../../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request, params }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	if (params.id !== admin.empresaId) return jsonError('Empresa não encontrada', 404);

	const empresa = await prisma.empresa.findUnique({ where: { id: params.id } });
	if (!empresa) return jsonError('Empresa não encontrada', 404);

	return jsonOk(toEmpresaDTO(empresa));
};

export const PUT: RequestHandler = async ({ request, params }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	if (params.id !== admin.empresaId) return jsonError('Empresa não encontrada', 404);
	const empresaId = admin.empresaId;

	let body: Partial<{
		nome: string;
		cnpj: string;
		razaoSocial: string;
		caepfCno: string;
		localPrestacao: string;
		horaAbertura: string;
		horaFechamento: string;
		bancoHorasRegime: string;
		bancoHorasInicio: string | null;
		bancoHorasNegativo: string;
	}>;

	try {
		body = await request.json();
	} catch {
		return jsonError('Corpo da requisição inválido', 400);
	}

	if (body.cnpj != null && body.cnpj.trim() !== '' && !isValidCnpj(body.cnpj)) {
		return jsonError('CNPJ inválido', 400, 'cnpj');
	}

	if (body.bancoHorasRegime != null && !REGIMES.includes(body.bancoHorasRegime as RegimeBanco)) {
		return jsonError(`bancoHorasRegime deve ser ${REGIMES.join(', ')}`, 400, 'bancoHorasRegime');
	}
	if (
		body.bancoHorasNegativo != null &&
		!DESTINOS_NEGATIVO.includes(body.bancoHorasNegativo as DestinoNegativo)
	) {
		return jsonError('bancoHorasNegativo deve ser zerar ou descontar', 400, 'bancoHorasNegativo');
	}
	if (body.bancoHorasInicio != null && !ehDia(body.bancoHorasInicio)) {
		return jsonError('bancoHorasInicio deve ser uma data AAAA-MM-dd', 400, 'bancoHorasInicio');
	}
	if (
		body.bancoHorasRegime &&
		body.bancoHorasRegime !== 'nenhum' &&
		body.bancoHorasInicio === null
	) {
		return jsonError('Informe o início do banco de horas', 400, 'bancoHorasInicio');
	}

	const atual = await prisma.empresa.findUnique({ where: { id: empresaId } });
	if (!atual) return jsonError('Empresa não encontrada', 404);

	const empresa = await prisma.$transaction(async (tx) => {
		const atualizada = await tx.empresa.update({
			where: { id: empresaId },
			data: {
				nome: body.nome ?? undefined,
				cnpj: body.cnpj ?? undefined,
				razaoSocial: body.razaoSocial ?? undefined,
				caepfCno: body.caepfCno ?? undefined,
				localPrestacao: body.localPrestacao ?? undefined,
				horaAbertura: body.horaAbertura ?? undefined,
				horaFechamento: body.horaFechamento ?? undefined,
				bancoHorasRegime: body.bancoHorasRegime ?? undefined,
				bancoHorasInicio:
					body.bancoHorasInicio === undefined
						? undefined
						: body.bancoHorasInicio === null
							? null
							: dataPura(body.bancoHorasInicio),
				bancoHorasNegativo: body.bancoHorasNegativo ?? undefined
			}
		});

		// AFD tipo 2: registra evento de alteração do empregador quando um dado
		// cadastral relevante muda (e há CNPJ + razão social para um registro válido).
		const mudouCadastro =
			atualizada.razaoSocial !== atual.razaoSocial ||
			atualizada.cnpj !== atual.cnpj ||
			atualizada.caepfCno !== atual.caepfCno ||
			atualizada.localPrestacao !== atual.localPrestacao;
		const inscricao = (atualizada.cnpj ?? '').replace(/\D/g, '');
		if (mudouCadastro && inscricao.length === 14 && atualizada.razaoSocial) {
			await registrarEventoEmpregador(tx, {
				empresaId,
				cpfResponsavel: admin.cpf,
				inscricaoTipo: '1',
				inscricao,
				caepfCno: atualizada.caepfCno,
				razaoSocial: atualizada.razaoSocial,
				localPrestacao: atualizada.localPrestacao
			});
		}

		return atualizada;
	});

	return jsonOk(toEmpresaDTO(empresa));
};
