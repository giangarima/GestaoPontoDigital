import { describe, expect, it } from 'vitest';
import {
	feriadosDoColaborador,
	feriadosMoveis,
	feriadosNacionais,
	juntarFeriados,
	pascoa,
	rotuloFeriado
} from './calendario';

describe('feriadosNacionais', () => {
	it('2026 tem os nove nacionais, com o 20/11', () => {
		const f = feriadosNacionais(2026);
		expect(f.size).toBe(9);
		expect(f.get('2026-04-21')).toBe('Tiradentes');
		expect(f.has('2026-11-20')).toBe(true);
	});

	it('20/11 só é nacional a partir de 2024', () => {
		expect(feriadosNacionais(2023).has('2023-11-20')).toBe(false);
	});
});

describe('pascoa', () => {
	it.each([
		[2024, '2024-03-31'],
		[2025, '2025-04-20'],
		[2026, '2026-04-05'],
		[2027, '2027-03-28']
	])('%i → %s', (ano, dia) => expect(pascoa(ano)).toBe(dia));

	it('móveis de 2026: Carnaval, Sexta-feira Santa e Corpus Christi', () => {
		expect(feriadosMoveis(2026).map((f) => [f.data, f.tipo, f.abrangencia])).toEqual([
			['2026-02-16', 'ponto_facultativo', 'nacional'],
			['2026-02-17', 'ponto_facultativo', 'nacional'],
			['2026-04-03', 'feriado', 'municipal'],
			['2026-06-04', 'ponto_facultativo', 'nacional']
		]);
	});
});

describe('juntarFeriados', () => {
	const cadastrado = (dia: string, nome: string, extra = {}) => ({
		data: new Date(`${dia}T00:00:00Z`),
		nome,
		tipo: 'feriado',
		abrangencia: 'municipal',
		escalados: [] as string[],
		...extra
	});

	it('recorta os nacionais no período, atravessa o ano e soma os cadastrados', () => {
		const f = juntarFeriados('2025-12-20', '2026-01-25', [
			cadastrado('2026-01-20', 'São Sebastião')
		]);
		expect([...f].map(([dia, x]) => [dia, x.nome, x.abrangencia])).toEqual([
			['2025-12-25', 'Natal', 'nacional'],
			['2026-01-01', 'Confraternização Universal', 'nacional'],
			['2026-01-20', 'São Sebastião', 'municipal']
		]);
	});

	it('linha na data de um nacional só traz a escala; o resto vem da lei', () => {
		const f = juntarFeriados('2026-04-21', '2026-04-21', [
			cadastrado('2026-04-21', 'qualquer', { abrangencia: 'nacional', escalados: ['c1'] })
		]);
		expect(f.get('2026-04-21')).toEqual({
			nome: 'Tiradentes',
			tipo: 'feriado',
			abrangencia: 'nacional',
			escalados: new Set(['c1'])
		});
	});
});

describe('feriadosDoColaborador', () => {
	it('marca escalado só para quem está na escala', () => {
		const empresa = juntarFeriados('2026-04-21', '2026-04-21', [
			{
				data: new Date('2026-04-21T00:00:00Z'),
				nome: '',
				tipo: 'feriado',
				abrangencia: 'nacional',
				escalados: ['c1']
			}
		]);
		expect(feriadosDoColaborador(empresa, 'c1').get('2026-04-21')?.escalado).toBe(true);
		expect(feriadosDoColaborador(empresa, 'c2').get('2026-04-21')?.escalado).toBe(false);
	});

	it('rótulos', () => {
		const base = { nome: 'X', abrangencia: 'municipal' as const };
		expect(rotuloFeriado({ ...base, tipo: 'feriado', escalado: false })).toBe('Feriado (X)');
		expect(rotuloFeriado({ ...base, tipo: 'feriado', escalado: true })).toBe(
			'Feriado trabalhado (X)'
		);
		expect(rotuloFeriado({ ...base, tipo: 'ponto_facultativo', escalado: false })).toBe(
			'Ponto facultativo (X)'
		);
	});
});
