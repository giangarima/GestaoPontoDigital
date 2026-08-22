/**
 * @module lib/server/afd/gerar
 * @description Geração do AFD (Arquivo Fonte de Dados) da Portaria 671/2021 para
 * REP-P, no leiaute oficial (Anexo). Monta um diário sequencial por NSR unindo
 * cabeçalho (tipo 1), empregador (tipo 2), empregado (tipo 5), marcações (tipo 7)
 * e trailer (tipo 9), mais a linha de assinatura. Linhas terminam em CRLF e o
 * arquivo é codificado em ISO-8859-1.
 */
import { prisma } from '@/lib/server/db';
import {
	padNum,
	padAlpha,
	toD,
	toDH,
	crc16kermit,
	COLETOR_BROWSER,
	MARCACAO_ONLINE,
	ASSINATURA_LITERAL
} from '@/lib/server/afd/format';
import {
	AFD_VERSAO_LEIAUTE,
	REP_INPI,
	REP_DEV_INSCRICAO_TIPO,
	REP_DEV_INSCRICAO
} from '@/lib/server/afd/config';

const CRLF = '\r\n';

/** Anexa o CRC-16/KERMIT do conteúdo (registros tipo 1/2/5). */
function comCrc(conteudo: string): string {
	return conteudo + crc16kermit(conteudo);
}

interface Linha {
	nsr: bigint;
	texto: string;
}

export interface AfdRange {
	inicio?: Date;
	fim?: Date;
}

export interface AfdResultado {
	conteudo: Uint8Array;
	nome: string;
	vazio: boolean;
}

export async function gerarAfd(empresaId: string, range: AfdRange = {}): Promise<AfdResultado> {
	const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
	if (!empresa) throw new Error('Empresa não encontrada');

	const filtroMarcado =
		range.inicio || range.fim
			? {
					marcadoEm: {
						...(range.inicio ? { gte: range.inicio } : {}),
						...(range.fim ? { lte: range.fim } : {})
					}
				}
			: {};

	const [eventosEmpregador, eventosEmpregado, batidas] = await Promise.all([
		prisma.eventoEmpregador.findMany({ where: { empresaId }, orderBy: { nsr: 'asc' } }),
		prisma.eventoEmpregado.findMany({ where: { empresaId }, orderBy: { nsr: 'asc' } }),
		prisma.registro.findMany({ where: { empresaId, ...filtroMarcado }, orderBy: { nsr: 'asc' } })
	]);

	const inscricao = (empresa.cnpj ?? '').replace(/\D/g, '');
	const razaoSocial = empresa.razaoSocial ?? empresa.nome;

	// Período coberto: min/max das marcações incluídas (fallback = agora).
	const datas = batidas.map((b) => b.marcadoEm.getTime());
	const dataInicial = datas.length ? new Date(Math.min(...datas)) : new Date();
	const dataFinal = datas.length ? new Date(Math.max(...datas)) : new Date();

	// ── Registro tipo 1 — cabeçalho (302 chars antes do CRLF) ──────────────────
	const cabecalho = comCrc(
		padNum(0, 9) + // "000000000"
			'1' +
			'1' + // tipo de inscrição do empregador: CNPJ
			padAlpha(inscricao, 14) +
			padNum(empresa.caepfCno ?? '', 14) +
			padAlpha(razaoSocial, 150) +
			padNum(REP_INPI, 17) +
			toD(dataInicial) +
			toD(dataFinal) +
			toDH(new Date()) +
			padNum(AFD_VERSAO_LEIAUTE, 3) +
			REP_DEV_INSCRICAO_TIPO +
			padAlpha(REP_DEV_INSCRICAO, 14) +
			padAlpha('', 30) // modelo (só REP-C)
	);

	const linhas: Linha[] = [];

	for (const e of eventosEmpregador) {
		linhas.push({
			nsr: e.nsr,
			texto: comCrc(
				padNum(e.nsr, 9) +
					'2' +
					toDH(e.registradoEm) +
					padNum(e.cpfResponsavel, 14) +
					e.inscricaoTipo +
					padAlpha(e.inscricao, 14) +
					padNum(e.caepfCno ?? '', 14) +
					padAlpha(e.razaoSocial, 150) +
					padAlpha(e.localPrestacao ?? '', 100)
			)
		});
	}

	for (const e of eventosEmpregado) {
		linhas.push({
			nsr: e.nsr,
			texto: comCrc(
				padNum(e.nsr, 9) +
					'5' +
					toDH(e.registradoEm) +
					padAlpha(e.operacao, 1) +
					padNum(e.cpfEmpregado, 12) +
					padAlpha(e.nomeEmpregado, 52) +
					padAlpha('', 4) + // demais dados de identificação
					padNum(e.cpfResponsavel, 11)
			)
		});
	}

	for (const b of batidas) {
		// Tipo 7 não tem CRC: o campo 8 é o hash SHA-256 já gravado (== fórmula oficial).
		linhas.push({
			nsr: b.nsr,
			texto:
				padNum(b.nsr, 9) +
				'7' +
				toDH(b.marcadoEm) +
				padNum(b.cpf, 12) +
				toDH(b.registradoEm) +
				COLETOR_BROWSER +
				MARCACAO_ONLINE +
				padAlpha(b.hash, 64)
		});
	}

	linhas.sort((a, b) => (a.nsr < b.nsr ? -1 : a.nsr > b.nsr ? 1 : 0));

	// ── Registro tipo 9 — trailer ──────────────────────────────────────────────
	const trailer =
		padNum(999999999, 9) +
		padNum(eventosEmpregador.length, 9) + // tipo 2
		padNum(0, 9) + // tipo 3
		padNum(0, 9) + // tipo 4
		padNum(eventosEmpregado.length, 9) + // tipo 5
		padNum(0, 9) + // tipo 6
		padNum(batidas.length, 9) + // tipo 7
		'9';

	const assinatura = padAlpha(ASSINATURA_LITERAL, 100);

	const todas = [cabecalho, ...linhas.map((l) => l.texto), trailer, assinatura];
	const texto = todas.map((l) => l + CRLF).join('');

	const nome = `AFD${REP_INPI}${inscricao}REP_P.txt`;

	return {
		conteudo: new Uint8Array(Buffer.from(texto, 'latin1')),
		nome,
		vazio: linhas.length === 0
	};
}
