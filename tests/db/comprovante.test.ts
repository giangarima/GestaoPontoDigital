/**
 * Comprovante de Registro de Ponto do Trabalhador (Portaria 671/2021, arts. 79
 * e 80) a partir do banco: hash da marcação igual ao do AFD, inclusões sem
 * comprovante, emissão e regeneração quando o arquivo guardado some.
 */
import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/server/db';
import buildComprovanteData from '@/lib/server/comprovante/build-data';
import { emitirComprovante, obterComprovantePdf } from '@/lib/server/comprovante/emitir';
import { textoDoPdf } from '@/lib/server/pdf/texto.test-util';
import { baterPonto, criarColaborador, criarEmpresa, incluirPonto } from './fixtures';

beforeEach(() => {
	vi.stubEnv('COMPROVANTE_SKIP_SIGN', 'true');
	vi.stubEnv('SMTP_HOST', '');
	vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

async function marcacao() {
	const empresa = await criarEmpresa();
	const { usuario, colaborador } = await criarColaborador(empresa.id, 'José da Conceição');
	const registro = await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
		marcadoEm: new Date('2026-01-05T11:02:00Z')
	});
	return { empresa, usuario, colaborador, registro };
}

describe('buildComprovanteData', () => {
	it('usa o hash gravado da marcação (campo 8 do tipo 7 no AFD), o NSR e a razão social', async () => {
		const { registro } = await marcacao();
		const d = await buildComprovanteData(registro.id);

		expect(d.hashMarcacao).toBe(registro.hash);
		expect(d.hashMarcacao).toMatch(/^[0-9a-f]{64}$/);
		expect(d.nsrFormatado).toBe('000000001');
		expect(d.empresaNome).toBe('Empresa Teste Ltda');
		expect(d.hora).toBe('08:02');
	});

	it('inclusão do tratamento (fonte "I") não tem comprovante', async () => {
		const { empresa, usuario, colaborador } = await marcacao();
		const inclusao = await incluirPonto(empresa.id, colaborador.id, usuario.cpf, new Date());
		await expect(buildComprovanteData(inclusao.id)).rejects.toThrow(/fonte "O"/);
	});
});

describe('emitirComprovante / obterComprovantePdf', () => {
	it('emite, marca como enviado e o PDF traz o hash da marcação', async () => {
		const { registro } = await marcacao();
		await emitirComprovante(registro.id);

		const salvo = await prisma.comprovante.findUniqueOrThrow({
			where: { registroId: registro.id }
		});
		expect(salvo).toMatchObject({ envioStatus: 'enviado', nsr: 1n });

		const { pdf, nome } = await obterComprovantePdf(registro.id);
		expect(nome).toBe('comprovante-ponto-000000001.pdf');
		const texto = textoDoPdf(pdf);
		expect(texto).toContain(registro.hash!.slice(0, 32));
		expect(texto).toContain(registro.hash!.slice(32));
	});

	it('arquivo guardado sumiu (disco efêmero): regera a partir do banco', async () => {
		const { registro } = await marcacao();
		await emitirComprovante(registro.id);
		const salvo = await prisma.comprovante.findUniqueOrThrow({
			where: { registroId: registro.id }
		});
		rmSync(path.resolve(process.cwd(), salvo.caminhoArquivo));

		const { pdf } = await obterComprovantePdf(registro.id);
		expect(textoDoPdf(pdf)).toContain(registro.hash!.slice(0, 32));
	});

	it('sem comprovante emitido (ex.: falha no envio), o download gera na hora', async () => {
		const { registro } = await marcacao();
		const { pdf } = await obterComprovantePdf(registro.id);

		expect(textoDoPdf(pdf)).toContain('000000001');
		expect(await prisma.comprovante.count({ where: { registroId: registro.id } })).toBe(1);
	});
});
