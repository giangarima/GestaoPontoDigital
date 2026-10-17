import { describe, expect, it } from 'vitest';
import { formatDia, formatMinutos, rotuloSerie, variacao } from './perfil';

describe('formatMinutos', () => {
	it('minutos e horas', () => {
		expect(formatMinutos(25)).toBe('25 min');
		expect(formatMinutos(65)).toBe('1h05');
		expect(formatMinutos(-130)).toBe('−2h10');
	});

	it('com sinal explícito', () => {
		expect(formatMinutos(8, true)).toBe('+8 min');
		expect(formatMinutos(0, true)).toBe('0 min');
	});
});

describe('variacao', () => {
	it('faltas que caem são melhora', () => {
		expect(variacao(2, 5, { menorEhMelhor: true })).toEqual({ texto: '−3', sentido: 'melhor' });
	});

	it('pontualidade que cai é piora, em pontos percentuais', () => {
		expect(variacao(80, 92.5, { menorEhMelhor: false, unidade: 'pp' })).toEqual({
			texto: '−12,5 p.p.',
			sentido: 'pior'
		});
	});

	it('atraso médio em minutos', () => {
		expect(variacao(18, 10, { menorEhMelhor: true, unidade: 'min' })).toEqual({
			texto: '+8 min',
			sentido: 'pior'
		});
	});

	it('sem mudança', () => {
		expect(variacao(3, 3, { menorEhMelhor: true })).toEqual({ texto: 'igual', sentido: 'igual' });
	});

	it('sem dado de um dos lados não inventa variação', () => {
		expect(variacao(80, null, { menorEhMelhor: false })).toBeNull();
		expect(variacao(null, 3, { menorEhMelhor: true })).toBeNull();
	});
});

describe('rótulos', () => {
	it('série mensal e semanal', () => {
		expect(rotuloSerie('2026-03', 'mes')).toBe('mar/26');
		expect(rotuloSerie('2026-01-05', 'semana')).toBe('05/01');
	});

	it('formatDia', () => {
		expect(formatDia('2026-01-05')).toBe('05/01/2026');
	});
});
