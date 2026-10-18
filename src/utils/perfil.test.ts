import { describe, expect, it } from 'vitest';
import { diaDaSemana, diaMes, formatDia, formatMinutos } from './perfil';

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

describe('rótulos', () => {
	it('dia da semana e dia/mês, sem depender do fuso', () => {
		expect(diaDaSemana('2026-10-17')).toBe('Sáb');
		expect(diaDaSemana('2026-10-12')).toBe('Seg');
		expect(diaMes('2026-10-12')).toBe('12/10');
	});

	it('formatDia', () => {
		expect(formatDia('2026-01-05')).toBe('05/01/2026');
	});
});
