import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { montarEspelho, type EspelhoEntrada, type MarcacaoEspelho } from './montar';
import { desenharEspelhoPdf } from './pdf';

const brt = (s: string) => new Date(`${s}:00-03:00`);
const comercial = {
	ativo: true,
	entrada: '08:00',
	saida_almoco: '12:00',
	retorno_almoco: '13:00',
	saida: '17:00'
};
const folga = { ativo: false, entrada: '', saida_almoco: '', retorno_almoco: '', saida: '' };

/** Janeiro/2026 inteiro com 4 batidas em cada dia útil. */
export function entradaExemplo(nome = 'José da Conceição'): EspelhoEntrada {
	const marcacoes: MarcacaoEspelho[] = [];
	let nsr = 1;
	for (let d = 1; d <= 31; d++) {
		const dia = `2026-01-${String(d).padStart(2, '0')}`;
		const dow = new Date(`${dia}T12:00:00Z`).getUTCDay();
		if (dow === 0 || dow === 6) continue;
		for (const h of ['08:00', '12:00', '13:00', '17:05']) {
			marcacoes.push({
				marcadoEm: brt(`${dia}T${h}`),
				fonte: 'O',
				nsr: BigInt(nsr++),
				criadoMotivo: null,
				anulacao: null
			});
		}
	}
	marcacoes.push({
		marcadoEm: brt('2026-01-05T07:55'),
		fonte: 'I',
		nsr: null,
		criadoMotivo: 'Esqueceu de bater — confirmado pelo gestor “in loco”',
		anulacao: null
	});
	return {
		empresa: { razaoSocial: 'Empresa Teste Ltda', cnpj: '12345678000199', caepfCno: null },
		trabalhador: {
			nome,
			cpf: '12345678901',
			admissao: new Date('2025-01-01T00:00:00Z'),
			desligamento: null,
			cargo: 'Analista'
		},
		inicio: '2026-01-01',
		fim: '2026-01-31',
		emitidoEm: brt('2026-02-02T09:00'),
		versoes: [
			{
				vigenciaInicio: new Date('2020-01-01T00:00:00Z'),
				dias: {
					segunda: comercial,
					terca: comercial,
					quarta: comercial,
					quinta: comercial,
					sexta: comercial,
					sabado: folga,
					domingo: folga
				}
			}
		],
		ausencias: [],
		marcacoes
	};
}

describe('desenharEspelhoPdf', () => {
	it('gera um PDF válido, com metadados, que pode ser relido', async () => {
		const doc = await desenharEspelhoPdf(montarEspelho(entradaExemplo()));
		const relido = await PDFDocument.load(await doc.save());

		expect(relido.getPageCount()).toBeGreaterThanOrEqual(1);
		expect(relido.getPageCount()).toBeLessThanOrEqual(2);
		expect(relido.getTitle()).toBe(
			'Espelho de Ponto - José da Conceição - 01/01/2026 a 31/01/2026'
		);
		expect(relido.getSubject()).toContain('art. 84');
	});

	it('texto fora do Latin-1 (emoji, símbolos) não quebra a geração', async () => {
		const doc = await desenharEspelhoPdf(montarEspelho(entradaExemplo('Zé 👷 ✓ Łukasz')));
		expect((await doc.save()).length).toBeGreaterThan(1000);
	});

	it('período longo quebra em várias páginas', async () => {
		const e = entradaExemplo();
		const doc = await desenharEspelhoPdf(montarEspelho({ ...e, fim: '2026-03-31' }));
		expect(doc.getPageCount()).toBeGreaterThan(1);
	});
});
