import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { textoDoPdf } from '@/lib/server/pdf/texto.test-util';
import { camposComprovante, desenharComprovantePdf, TITULO_COMPROVANTE } from './pdf';
import type { ComprovanteData } from './types';

const HASH = 'a3f1c2d4e5b6978812345678901234567890abcdefabcdefabcdefabcdef0123';

function dados(extra: Partial<ComprovanteData> = {}): ComprovanteData {
	return {
		sistemaNome: 'GestaoPontoDigital',
		registroId: 'r1',
		nsr: 42n,
		nsrFormatado: '000000042',
		tipo: 'entrada',
		tipoLabel: 'ENTRADA',
		marcadoEm: new Date('2026-01-05T11:02:00Z'),
		data: '05/01/2026',
		hora: '08:02',
		empresaNome: 'Empresa Teste Ltda',
		empresaId: 'e1',
		empresaCnpj: '12.345.678/0001-99',
		empresaCaepfCno: null,
		localPrestacao: null,
		colaboradorNome: 'José da Conceição',
		colaboradorId: 'c1',
		colaboradorCpf: '123.456.789-01',
		colaboradorEmail: 'jose@teste.com',
		repInpi: 'BR512026000123-4',
		hashMarcacao: HASH,
		nomeArquivo: 'comprovante-ponto-000000042.pdf',
		...extra
	};
}

describe('camposComprovante (art. 79)', () => {
	it('traz NSR, empregador, trabalhador, data/horário, INPI e hash', () => {
		const campos = Object.fromEntries(
			camposComprovante(dados()).map((s) => [s.titulo, Object.fromEntries(s.campos)])
		);
		expect(campos).toEqual({
			Marcação: { NSR: '000000042' },
			Empregador: {
				Nome: 'Empresa Teste Ltda',
				'CNPJ/CPF': '12.345.678/0001-99',
				'CAEPF/CNO': '-'
			},
			Trabalhador: { Nome: 'José da Conceição', CPF: '123.456.789-01' },
			Registro: { Data: '05/01/2026', Horário: '08:02', Tipo: 'ENTRADA' },
			'REP-P': { 'Registro no INPI': 'BR512026000123-4' },
			'Código hash (SHA-256) da marcação': { '': HASH }
		});
	});

	it('local da prestação só aparece quando cadastrado', () => {
		const [, empregador] = camposComprovante(dados({ localPrestacao: 'Rua das Flores, 100' }));
		expect(empregador.campos).toContainEqual(['Local', 'Rua das Flores, 100']);
	});
});

describe('desenharComprovantePdf', () => {
	it('o PDF contém o título, o NSR, o INPI e o hash (em 2 linhas)', async () => {
		const doc = await desenharComprovantePdf(dados(), { assinado: true });
		const bytes = await doc.save();
		const texto = textoDoPdf(bytes);

		expect(texto).toContain(TITULO_COMPROVANTE);
		expect(texto).toContain('000000042');
		expect(texto).toContain('BR512026000123-4');
		expect(texto).toContain(HASH.slice(0, 32));
		expect(texto).toContain(HASH.slice(32));
		expect(texto).toContain('José da Conceição');
		expect(texto).toContain('assinado eletronicamente (PAdES)');
		expect((await PDFDocument.load(bytes)).getTitle()).toBe(
			`${TITULO_COMPROVANTE} - NSR 000000042`
		);
	});

	it('sem certificado, avisa que o documento não está assinado', async () => {
		const doc = await desenharComprovantePdf(dados(), { assinado: false });
		expect(textoDoPdf(await doc.save())).toContain('SEM assinatura eletrônica');
	});
});
