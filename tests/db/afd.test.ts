/**
 * AFD gerado a partir de dados reais no banco, conferido contra o leiaute da
 * Portaria 671/2021: tamanho de cada tipo de registro, ordem por NSR, CRC,
 * trailer e codificação.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/server/db';
import { gerarAfd } from '@/lib/server/afd/gerar';
import { crc16kermit } from '@/lib/server/afd/format';
import { registrarEventoEmpregado, registrarEventoEmpregador } from '@/lib/server/registro-ledger';
import { baterPonto, criarColaborador, criarEmpresa, incluirPonto } from './fixtures';

/** Tamanho (sem CRLF) de cada tipo de registro no leiaute do REP-P. */
const TAMANHO_POR_TIPO: Record<string, number> = {
	'1': 302,
	'2': 331,
	'5': 118,
	'7': 137,
	'9': 64
};

type Empresa = Awaited<ReturnType<typeof criarEmpresa>>;
type Colab = Awaited<ReturnType<typeof criarColaborador>>;

let empresa: Empresa;
let colab: Colab;

beforeAll(async () => {
	empresa = await criarEmpresa();
	colab = await criarColaborador(empresa.id, 'José da Conceição');
	const cpf = colab.usuario.cpf;

	// NSR 1: cadastro do empregador | NSR 2: inclusão do empregado | NSR 3–5: batidas
	await prisma.$transaction((tx) =>
		registrarEventoEmpregador(tx, {
			empresaId: empresa.id,
			cpfResponsavel: '11111111111',
			inscricaoTipo: '1',
			inscricao: empresa.cnpj!,
			razaoSocial: 'Empresa Teste Ltda',
			localPrestacao: 'Rua das Flores, 100'
		})
	);
	await prisma.$transaction((tx) =>
		registrarEventoEmpregado(tx, {
			empresaId: empresa.id,
			operacao: 'I',
			cpfEmpregado: cpf,
			nomeEmpregado: colab.usuario.nome,
			cpfResponsavel: '11111111111',
			colaboradorId: colab.colaborador.id
		})
	);
	for (const [dia, hora] of [
		['05', '11:00'],
		['05', '15:00'],
		['06', '11:00']
	]) {
		await baterPonto(empresa.id, colab.colaborador.id, cpf, {
			marcadoEm: new Date(`2026-01-${dia}T${hora}:00Z`)
		});
	}
	// Inclusão do tratamento (admin): NÃO pode aparecer no AFD — só o REP gera o AFD.
	await incluirPonto(empresa.id, colab.colaborador.id, cpf, new Date('2026-01-06T15:00:00Z'));
});

async function linhasDoAfd(range?: Parameters<typeof gerarAfd>[1]) {
	const afd = await gerarAfd(empresa.id, range);
	const texto = Buffer.from(afd.conteudo).toString('latin1');
	return { afd, texto, linhas: texto.split('\r\n') };
}

describe('gerarAfd', () => {
	it('termina cada linha em CRLF e usa ISO-8859-1', async () => {
		const { afd, texto, linhas } = await linhasDoAfd();

		expect(texto.endsWith('\r\n')).toBe(true);
		expect(linhas.at(-1)).toBe('');
		expect(texto.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
		// "ã" e "ç" do nome: 1 byte cada em latin1 (seriam 2 em UTF-8)
		expect(texto).toContain('José da Conceição');
		expect(afd.conteudo.length).toBe(texto.length);
	});

	it('cada tipo de registro tem o tamanho do leiaute', async () => {
		const { linhas } = await linhasDoAfd();
		const registros = linhas.slice(0, -2); // tira a linha de assinatura e o '' final

		const tipos = registros.map((l, i) =>
			i === 0 ? '1' : i === registros.length - 1 ? '9' : l[9]
		);
		expect(tipos).toEqual(['1', '2', '5', '7', '7', '7', '9']);

		registros.forEach((linha, i) => {
			expect(linha.length, `linha ${i + 1} (tipo ${tipos[i]})`).toBe(TAMANHO_POR_TIPO[tipos[i]]);
		});
		expect(linhas.at(-2)).toHaveLength(100); // assinatura
	});

	it('eventos e batidas saem em ordem de NSR, sem buracos', async () => {
		const { linhas } = await linhasDoAfd();
		const nsrs = linhas.slice(1, -3).map((l) => Number(l.slice(0, 9)));
		expect(nsrs).toEqual([1, 2, 3, 4, 5]);
	});

	it('registros 1, 2 e 5 terminam com o CRC-16 do próprio conteúdo', async () => {
		const { linhas } = await linhasDoAfd();
		const comCrc = [linhas[0], linhas[1], linhas[2]];
		for (const linha of comCrc) {
			expect(linha.slice(-4)).toBe(crc16kermit(linha.slice(0, -4)));
		}
	});

	it('inclusões do tratamento (fonte "I") ficam fora do AFD', async () => {
		const { linhas } = await linhasDoAfd();
		const inclusoes = await prisma.registro.count({ where: { empresaId: empresa.id, fonte: 'I' } });
		expect(inclusoes).toBe(1);
		expect(linhas.filter((l) => l[9] === '7')).toHaveLength(3); // só as 3 originais
		expect(linhas.join('\n')).not.toContain('2026-01-06T12:00:00-0300');
	});

	it('o campo de hash do tipo 7 é o hash gravado no banco', async () => {
		const { linhas } = await linhasDoAfd();
		const regs = await prisma.registro.findMany({
			where: { empresaId: empresa.id, fonte: 'O' },
			orderBy: { nsr: 'asc' }
		});
		const tipo7 = linhas.filter((l) => l[9] === '7');
		expect(tipo7.map((l) => l.slice(-64))).toEqual(regs.map((r) => r.hash));
	});

	it('marcação no tipo 7 sai no horário de Brasília', async () => {
		const { linhas } = await linhasDoAfd();
		const primeira = linhas.find((l) => l[9] === '7')!;
		expect(primeira.slice(10, 34)).toBe('2026-01-05T08:00:00-0300');
	});

	it('trailer conta os registros por tipo', async () => {
		const { linhas } = await linhasDoAfd();
		const trailer = linhas.at(-3)!;
		expect(trailer).toBe(
			'999999999' +
				'000000001' + // tipo 2
				'000000000' + // tipo 3
				'000000000' + // tipo 4
				'000000001' + // tipo 5
				'000000000' + // tipo 6
				'000000003' + // tipo 7
				'9'
		);
	});

	it('cabeçalho traz o CNPJ e o período das marcações', async () => {
		const { linhas } = await linhasDoAfd();
		const cab = linhas[0];
		expect(cab.slice(11, 25)).toBe(empresa.cnpj);
		expect(cab.slice(206, 216)).toBe('2026-01-05'); // data inicial
		expect(cab.slice(216, 226)).toBe('2026-01-06'); // data final
	});

	it('filtro de período restringe as batidas, mas mantém os eventos de cadastro', async () => {
		const { linhas } = await linhasDoAfd({
			inicio: new Date('2026-01-06T00:00:00Z'),
			fim: new Date('2026-01-06T23:59:59Z')
		});
		const tipos = linhas.slice(1, -3).map((l) => l[9]);
		expect(tipos).toEqual(['2', '5', '7']);
		expect(linhas.at(-3)!.slice(54, 63)).toBe('000000001'); // trailer: 1 batida
	});
});
