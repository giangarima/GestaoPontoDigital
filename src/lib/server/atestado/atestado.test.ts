import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { textoDoPdf } from '@/lib/server/pdf/texto.test-util';
import { camposAtestado, declaracaoAtestado, type AtestadoEntrada } from './montar';
import { desenharAtestadoPdf } from './pdf';

function entrada(tipo: AtestadoEntrada['tipo']): AtestadoEntrada {
	return {
		tipo,
		desenvolvedora: {
			razaoSocial: 'OnTime Sistemas',
			inscricaoTipo: '1',
			inscricao: '12.345.678/0001-99'
		},
		programa: {
			inpi: 'BR512026000123',
			certificadoInpi: 'N/A',
			nome: 'OnTime - Controle de Jornada Digital',
			versao: '0.1.0'
		},
		destinataria: { razaoSocial: 'Empresa Demo Serviços LTDA', cnpj: '00.000.000/0001-00' }
	};
}

describe('camposAtestado (modelo oficial do gov.br)', () => {
	it('REP-P: campos na ordem do modelo, equipamento "N/A" e o número do INPI', () => {
		expect(camposAtestado(entrada('REP-P'))).toEqual([
			['Tipo do REP/PTRP', 'REP-P'],
			['Marca Equipamento', 'N/A'],
			['Modelo Equipamento', 'N/A'],
			['Certificado de conformidade', 'N/A'],
			['Número de fabricação', 'N/A'],
			['Número de registro no INPI', 'BR512026000123'],
			['Certificado de registro de programa de computador no INPI', 'N/A'],
			['Identificador do Programa', 'OnTime - Controle de Jornada Digital'],
			['Versão do Programa', '0.1.0']
		]);
	});

	it('PTRP: o número de registro no INPI (do REP-P) fica "N/A"', () => {
		const campos = Object.fromEntries(camposAtestado(entrada('PTRP')));
		expect(campos['Tipo do REP/PTRP']).toBe('PTRP');
		expect(campos['Número de registro no INPI']).toBe('N/A');
	});

	it('declaração cita a desenvolvedora, o CNPJ e o art. 89', () => {
		expect(declaracaoAtestado(entrada('REP-P'))).toContain(
			'empresa OnTime Sistemas (CNPJ nº 12.345.678/0001-99)'
		);
		expect(declaracaoAtestado(entrada('REP-P'))).toContain('art. 89 da Portaria MTP nº 671/2021');
	});
});

describe('desenharAtestadoPdf', () => {
	it('uma página por atestado, com destinatária e linhas de assinatura em branco', async () => {
		const doc = await desenharAtestadoPdf([entrada('REP-P'), entrada('PTRP')], {
			assinadoDemo: false
		});
		const bytes = await doc.save();
		const texto = textoDoPdf(bytes);

		expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
		expect(texto).toContain('ATESTADO TÉCNICO E TERMO DE RESPONSABILIDADE');
		expect(texto).toContain('Empresa Demo Serviços LTDA');
		expect(texto).toContain('Nome e CPF do Responsável Legal');
		expect(texto).toContain('Nome e CPF do Responsável Técnico');
		expect(texto).toContain('falsidade ideológica');
		expect(texto).not.toContain('demonstração');
	});

	it('com a assinatura do sistema, avisa que é só demonstração', async () => {
		const doc = await desenharAtestadoPdf([entrada('REP-P')], { assinadoDemo: true });
		expect(textoDoPdf(await doc.save())).toContain('NÃO substitui a');
	});
});
