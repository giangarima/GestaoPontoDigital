/**
 * @module lib/server/aej/gerar
 * @description Geração do AEJ (Arquivo Eletrônico de Jornada) em conformidade
 * com a Portaria MTP nº 671/2021.
 *
 * Regras:
 *  - Contém o "ponto tratado": registros anulados são ignorados (`anulacao: null`).
 *  - Codificação ISO-8859-1, quebra de linha CRLF.
 *  - Cada linha termina com CRC-16/KERMIT (reutilizado do módulo AFD).
 *  - Layout por blocos numéricos de 2 dígitos (01–99).
 */

import { prisma } from '@/lib/server/db';
import { padNum, padAlpha, toD, crc16kermit } from '@/lib/server/afd/format';

const BRT_OFFSET_MIN = -180;

/** Desloca o instante para a hora-relógio de Brasília (mesma lógica do AFD). */
function toBrt(date: Date): Date {
	return new Date(date.getTime() + BRT_OFFSET_MIN * 60_000);
}

/** Monta uma linha do AEJ: tipo + campos + CRC-16. */
function linha(tipo: string, campos: string): string {
	const corpo = tipo + campos;
	return corpo + crc16kermit(corpo);
}

/** Converte string para bytes ISO-8859-1 (latin1). */
function toLatin1(str: string): Uint8Array {
	return new Uint8Array(Buffer.from(str, 'latin1'));
}

/** Sequência CRLF como bytes. */
const CRLF = new Uint8Array([0x0d, 0x0a]);

export interface AejResultado {
	conteudo: Uint8Array;
	nome: string;
}

export async function gerarAej(
	empresaId: string,
	range: { inicio: Date; fim: Date }
): Promise<AejResultado> {
	const [empresa, colaboradores, jornadas, registros, ausencias] = await Promise.all([
		prisma.empresa.findUnique({ where: { id: empresaId } }),
		prisma.colaborador.findMany({
			where: { empresaId, deletedAt: null },
			include: { usuario: { select: { nome: true, cpf: true } } },
			orderBy: { createdAt: 'asc' }
		}),
		prisma.jornada.findMany({
			where: { empresaId },
			orderBy: { createdAt: 'asc' }
		}),
		prisma.registro.findMany({
			where: {
				empresaId,
				marcadoEm: { gte: range.inicio, lte: range.fim },
				anulacao: null
			},
			include: {
				colaborador: { include: { usuario: { select: { cpf: true } } } }
			},
			orderBy: { marcadoEm: 'asc' }
		}),
		prisma.ausencia.findMany({
			where: {
				empresaId,
				status: 'aprovada',
				OR: [
					{ dataInicio: { gte: range.inicio, lte: range.fim } },
					{ dataFim: { gte: range.inicio, lte: range.fim } },
					{ dataInicio: { lte: range.inicio }, dataFim: { gte: range.fim } }
				]
			},
			include: {
				colaborador: { include: { usuario: { select: { cpf: true } } } }
			},
			orderBy: { dataInicio: 'asc' }
		})
	]);

	if (!empresa) throw new Error('Empresa não encontrada');

	const hoje = new Date();
	const cnpjLimpo = (empresa.cnpj ?? '').replace(/\D/g, '');
	const linhas: string[] = [];
	const contador: Record<string, number> = {
		'01': 0,
		'02': 0,
		'03': 0,
		'04': 0,
		'05': 0,
		'07': 0
	};

	/* ---------- 01 – Cabeçalho ---------- */
	linhas.push(
		linha(
			'01',
			padNum(cnpjLimpo, 14) +
				padAlpha(empresa.razaoSocial ?? empresa.nome, 150) +
				toD(range.inicio) +
				toD(range.fim) +
				toD(hoje) +
				padAlpha('00100', 5)
		)
	);
	contador['01']++;

	/* ---------- 02 – Identificação do REP (mockado/vazio) ---------- */
	linhas.push(
		linha(
			'02',
			padAlpha('P', 1) + // P = REP-P
				padAlpha('', 20) + // Número de série
				padAlpha('', 20) + // Fabricante
				padAlpha('', 20) + // Modelo
				padAlpha('', 14) + // CNPJ do fabricante
				toD(hoje) + // Data de instalação
				padAlpha('S', 1) // Ativo (S=Sim)
		)
	);
	contador['02']++;

	/* ---------- 03 – Trabalhadores ---------- */
	for (const c of colaboradores) {
		linhas.push(
			linha(
				'03',
				padNum(c.usuario.cpf.replace(/\D/g, ''), 11) +
					padAlpha(c.usuario.nome, 60) +
					padAlpha(c.id, 20) +
					padAlpha(c.cargo ?? '', 30) +
					padAlpha(c.status ?? 'ativo', 10)
			)
		);
		contador['03']++;
	}

	/* ---------- 04 – Jornadas ---------- */
	for (const j of jornadas) {
		linhas.push(linha('04', padAlpha(j.id, 20) + padAlpha(j.nome, 60) + padAlpha('', 10)));
		contador['04']++;
	}

	/* ---------- 05 – Marcações (ponto tratado) ---------- */
	for (const r of registros) {
		const d = toBrt(new Date(r.marcadoEm));
		const hora = d.getUTCHours();
		const minuto = d.getUTCMinutes();

		let codMarcacao = 'E'; // entrada
		if (r.tipo === 'saida_almoco') codMarcacao = 'I';
		else if (r.tipo === 'retorno_almoco') codMarcacao = 'R';
		else if (r.tipo === 'saida') codMarcacao = 'S';

		linhas.push(
			linha(
				'05',
				toD(d) +
					padNum(r.cpf.replace(/\D/g, ''), 11) +
					padNum(hora, 2) +
					padNum(minuto, 2) +
					codMarcacao +
					padAlpha(r.metodo, 10) +
					padNum(String(r.nsr), 9)
			)
		);
		contador['05']++;
	}

	/* ---------- 07 – Ausências aprovadas ---------- */
	for (const a of ausencias) {
		linhas.push(
			linha(
				'07',
				padNum(a.colaborador.usuario.cpf.replace(/\D/g, ''), 11) +
					toD(a.dataInicio) +
					toD(a.dataFim) +
					padAlpha(a.tipo, 20) +
					padAlpha(a.motivo ?? '', 100)
			)
		);
		contador['07']++;
	}

	/* ---------- 99 – Trailer ---------- */
	const totalRegistros = linhas.length + 1; // +1 inclui o próprio trailer
	linhas.push(
		linha(
			'99',
			padNum(contador['01'], 9) +
				padNum(contador['02'], 9) +
				padNum(contador['03'], 9) +
				padNum(contador['04'], 9) +
				padNum(contador['05'], 9) +
				padNum(contador['07'], 9) +
				padNum(totalRegistros, 9)
		)
	);

	/* ---------- Monta o arquivo em memória (ISO-8859-1 + CRLF) ---------- */
	const chunks: Uint8Array[] = [];
	for (const l of linhas) {
		chunks.push(toLatin1(l));
		chunks.push(CRLF);
	}

	const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
	const conteudo = new Uint8Array(totalLength);
	let offset = 0;
	for (const c of chunks) {
		conteudo.set(c, offset);
		offset += c.length;
	}

	const nome = `AEJ_${padNum(cnpjLimpo, 14)}_${toD(range.inicio).replace(/-/g, '')}_${toD(range.fim).replace(/-/g, '')}.txt`;

	return { conteudo, nome };
}
