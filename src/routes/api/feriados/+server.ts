/**
 * @endpoint GET/POST /api/feriados
 * @description Feriados e pontos facultativos da empresa. GET `?ano=AAAA` devolve
 * os nacionais (fixos em lei) junto com os cadastrados, em ordem de data, cada um
 * com a escala de quem trabalha, e as datas móveis ainda não cadastradas
 * (sugestões). POST cadastra um feriado estadual/municipal ou ponto facultativo.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { Prisma } from '@/lib/server/prisma-client/client';
import { prisma } from '@/lib/server/db';
import {
	ABRANGENCIAS,
	TIPOS_FERIADO,
	feriadosMoveis,
	feriadosNacionais,
	type Abrangencia,
	type TipoFeriado
} from '@/lib/server/feriado/calendario';
import { dataPura, diaDaDataPura, ehDia } from '@/lib/server/periodo';
import { requireAdmin, jsonError, jsonOk } from '../_lib/auth-helpers';

export const GET: RequestHandler = async ({ request, url }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	const ano = Number(url.searchParams.get('ano') ?? new Date().getFullYear());
	if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
		return jsonError('ano inválido', 400);
	}

	const linhas = await prisma.feriado.findMany({
		where: {
			empresaId: admin.empresaId,
			data: { gte: dataPura(`${ano}-01-01`), lte: dataPura(`${ano}-12-31`) }
		},
		include: { escala: { select: { colaboradorId: true } } }
	});
	const porDia = new Map(linhas.map((f) => [diaDaDataPura(f.data), f]));

	// Nacional com linha = a empresa abre no dia; a linha só guarda a escala.
	const nacionais = [...feriadosNacionais(ano)].map(([data, nome]) => {
		const linha = porDia.get(data);
		porDia.delete(data);
		return {
			id: linha?.id ?? null,
			data,
			nome,
			tipo: 'feriado' as TipoFeriado,
			abrangencia: 'nacional' as Abrangencia,
			lei: true,
			escalados: linha?.escala.map((e) => e.colaboradorId) ?? []
		};
	});
	const cadastrados = [...porDia.entries()].map(([data, f]) => ({
		id: f.id,
		data,
		nome: f.nome,
		tipo: f.tipo as TipoFeriado,
		abrangencia: f.abrangencia as Abrangencia,
		lei: false,
		escalados: f.escala.map((e) => e.colaboradorId)
	}));
	const feriados = [...nacionais, ...cadastrados].sort((a, b) =>
		a.data < b.data ? -1 : a.data > b.data ? 1 : 0
	);

	const ocupados = new Set(feriados.map((f) => f.data));
	const sugestoes = feriadosMoveis(ano).filter((f) => !ocupados.has(f.data));

	return jsonOk({ ano, feriados, sugestoes });
};

export const POST: RequestHandler = async ({ request }) => {
	let admin;
	try {
		admin = requireAdmin(request);
	} catch (response) {
		return response as Response;
	}

	let body: { data?: string; nome?: string; tipo?: string; abrangencia?: string };
	try {
		body = await request.json();
	} catch {
		return jsonError('Corpo da requisição inválido', 400);
	}

	const nome = body.nome?.trim();
	const tipo = (body.tipo ?? 'feriado') as TipoFeriado;
	const abrangencia = (body.abrangencia ?? 'municipal') as Abrangencia;
	if (!ehDia(body.data) || !nome) {
		return jsonError('data (AAAA-MM-dd) e nome são obrigatórios', 400);
	}
	if (!TIPOS_FERIADO.includes(tipo)) {
		return jsonError(`tipo deve ser ${TIPOS_FERIADO.join(' ou ')}`, 400);
	}
	if (!ABRANGENCIAS.includes(abrangencia)) {
		return jsonError(`abrangencia deve ser ${ABRANGENCIAS.join(', ')}`, 400);
	}
	// Feriado nacional é o da lei; ponto facultativo nacional (Carnaval) é cadastrável.
	if (abrangencia === 'nacional' && tipo === 'feriado') {
		return jsonError('Os feriados nacionais já vêm da lei; cadastre estaduais e municipais', 400);
	}
	if (feriadosNacionais(Number(body.data.slice(0, 4))).has(body.data)) {
		return jsonError('Essa data já é feriado nacional', 409);
	}

	try {
		const f = await prisma.feriado.create({
			data: { empresaId: admin.empresaId, data: dataPura(body.data), nome, tipo, abrangencia }
		});
		return jsonOk(
			{
				id: f.id,
				data: diaDaDataPura(f.data),
				nome: f.nome,
				tipo,
				abrangencia,
				lei: false,
				escalados: []
			},
			201
		);
	} catch (e) {
		if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
			return jsonError('Já existe um feriado nessa data', 409);
		}
		throw e;
	}
};
