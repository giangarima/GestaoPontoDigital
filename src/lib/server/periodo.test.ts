import { describe, expect, it } from 'vitest';
import {
	ausenciaNoPeriodo,
	dataPura,
	diaDaDataPura,
	diaDe,
	diasDoMes,
	ehDia,
	instantesDoPeriodo,
	minutosDoDia
} from './periodo';

describe('diaDe (instante → dia de Brasília)', () => {
	it('batida às 22:30 de Brasília (01:30 UTC do dia seguinte) é do próprio dia', () => {
		expect(diaDe(new Date('2026-01-06T01:30:00Z'))).toBe('2026-01-05');
	});

	it('meia-noite de Brasília já é o dia novo', () => {
		expect(diaDe(new Date('2026-01-06T03:00:00Z'))).toBe('2026-01-06');
		expect(diaDe(new Date('2026-01-06T02:59:59Z'))).toBe('2026-01-05');
	});
});

describe('minutosDoDia', () => {
	it('conta a partir da meia-noite de Brasília, não do fuso do servidor', () => {
		expect(minutosDoDia(new Date('2026-01-05T11:07:00Z'))).toBe(8 * 60 + 7);
		expect(minutosDoDia(new Date('2026-01-06T01:30:00Z'))).toBe(22 * 60 + 30);
	});
});

describe('ehDia', () => {
	it('aceita AAAA-MM-dd existente', () => {
		expect(ehDia('2024-02-29')).toBe(true);
	});

	it('recusa formato errado, dia inexistente e vazio', () => {
		expect(ehDia('2026-02-30')).toBe(false);
		expect(ehDia('2026-1-5')).toBe(false);
		expect(ehDia('05/01/2026')).toBe(false);
		expect(ehDia(null)).toBe(false);
		expect(ehDia('')).toBe(false);
	});
});

describe('diasDoMes', () => {
	it('acha o último dia, inclusive em fevereiro bissexto', () => {
		expect(diasDoMes('2026-01')).toEqual({ inicio: '2026-01-01', fim: '2026-01-31' });
		expect(diasDoMes('2024-02')).toEqual({ inicio: '2024-02-01', fim: '2024-02-29' });
		expect(diasDoMes('2026-04')).toEqual({ inicio: '2026-04-01', fim: '2026-04-30' });
	});
});

describe('filtros de período', () => {
	it('instantes cobrem o dia inteiro de Brasília (03:00 UTC até 02:59:59.999 UTC do dia seguinte)', () => {
		expect(instantesDoPeriodo('2026-01-05', '2026-01-06')).toEqual({
			gte: new Date('2026-01-05T03:00:00.000Z'),
			lte: new Date('2026-01-07T02:59:59.999Z')
		});
	});

	it('ausências comparam datas puras: a do primeiro dia do período entra', () => {
		const filtro = ausenciaNoPeriodo('2026-01-05', '2026-01-09');
		const ausenciaDia5 = dataPura('2026-01-05'); // gravada à meia-noite UTC
		expect(ausenciaDia5.getTime()).toBeGreaterThanOrEqual(filtro.dataFim.gte.getTime());
		expect(ausenciaDia5.getTime()).toBeLessThanOrEqual(filtro.dataInicio.lte.getTime());
	});

	it('data pura ida e volta', () => {
		expect(diaDaDataPura(dataPura('2026-03-01'))).toBe('2026-03-01');
	});
});
