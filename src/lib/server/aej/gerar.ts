/**
 * @module lib/server/aej/gerar
 * @description Carrega do banco os dados do período e gera o arquivo AEJ
 * (Portaria 671/2021). A montagem das linhas, com as regras do leiaute, fica em
 * `montar.ts` (pura, testável sem banco).
 */
import { prisma } from '@/lib/server/db';
import { padNum, toD } from '@/lib/server/afd/format';
import { ausenciaDateKeys } from '@/lib/server/timesheet';
import { ausenciaNoPeriodo } from '@/lib/server/periodo';
import { montarLinhasAej } from './montar';

function digitos(valor: string | null | undefined): string {
	return (valor ?? '').replace(/\D/g, '');
}

export interface AejResultado {
	conteudo: Uint8Array;
	nome: string;
}

export async function gerarAej(
	empresaId: string,
	range: { inicio: Date; fim: Date },
	agora: Date = new Date()
): Promise<AejResultado> {
	const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
	if (!empresa) throw new Error('Empresa não encontrada');

	// Vínculos ativos em algum momento do período.
	const colaboradores = await prisma.colaborador.findMany({
		where: {
			empresaId,
			OR: [{ dataAdmissao: null }, { dataAdmissao: { lte: range.fim } }],
			AND: [{ OR: [{ deletedAt: null }, { deletedAt: { gte: range.inicio } }] }]
		},
		include: {
			usuario: { select: { nome: true, cpf: true } },
			jornada: { include: { versoes: true } },
			registros: {
				where: { marcadoEm: { gte: range.inicio, lte: range.fim } },
				include: { anulacao: { select: { motivo: true } } }
			},
			ausencias: {
				// Ausência é data pura: compara pelos dias do período, não pelos instantes.
				where: { status: 'aprovada', ...ausenciaNoPeriodo(toD(range.inicio), toD(range.fim)) }
			}
		},
		orderBy: { usuario: { nome: 'asc' } }
	});

	const linhas = montarLinhasAej({
		empresa: {
			cnpj: empresa.cnpj,
			caepfCno: empresa.caepfCno,
			razaoSocial: empresa.razaoSocial ?? empresa.nome
		},
		inicio: range.inicio,
		fim: range.fim,
		agora,
		vinculos: colaboradores.map((c) => ({
			cpf: c.usuario.cpf,
			nome: c.usuario.nome,
			admissao: c.dataAdmissao,
			desligamento: c.deletedAt,
			versoes: c.jornada?.versoes ?? [],
			diasAbonados: ausenciaDateKeys(c.ausencias),
			marcacoes: c.registros
		}))
	});

	const cnpj = padNum(digitos(empresa.cnpj), 14);
	const periodo = `${toD(range.inicio).replace(/-/g, '')}_${toD(range.fim).replace(/-/g, '')}`;
	return {
		conteudo: new Uint8Array(Buffer.from(linhas.map((l) => `${l}\r\n`).join(''), 'latin1')),
		nome: `AEJ_${cnpj}_${periodo}.txt`
	};
}
