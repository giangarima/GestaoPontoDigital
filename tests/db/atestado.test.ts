/** Atestado Técnico (art. 89) gerado para a empresa do banco. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { gerarAtestadoPdf } from '@/lib/server/atestado/gerar';
import { textoDoPdf } from '@/lib/server/pdf/texto.test-util';
import { criarEmpresa } from './fixtures';

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('gerarAtestadoPdf', () => {
	it('REP-P e PTRP, com a empresa do banco como destinatária', async () => {
		vi.stubEnv('COMPROVANTE_SKIP_SIGN', 'true');
		const empresa = await criarEmpresa();
		const pdf = await gerarAtestadoPdf(empresa.id);
		const texto = textoDoPdf(pdf.conteudo);

		expect(pdf.assinado).toBe(false);
		expect(pdf.nome).toBe(`atestado_tecnico_${empresa.cnpj}.pdf`);
		expect((await PDFDocument.load(pdf.conteudo)).getPageCount()).toBe(2);
		expect(texto).toContain('Empresa Teste Ltda');
		expect(texto).toMatch(/REP-P[\s\S]*PTRP/);
	});
});
