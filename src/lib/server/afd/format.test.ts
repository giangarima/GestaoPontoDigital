import { describe, expect, it } from 'vitest';
import { crc16kermit, padAlpha, padNum, toD, toDH } from './format';

describe('padNum (campo N)', () => {
	it('completa com zeros à esquerda', () => {
		expect(padNum(42, 9)).toBe('000000042');
		expect(padNum(123n, 5)).toBe('00123');
	});

	it('remove a máscara e mantém só dígitos', () => {
		expect(padNum('123.456.789-01', 12)).toBe('012345678901');
	});

	it('trunca mantendo os dígitos da direita', () => {
		expect(padNum('1234567890', 4)).toBe('7890');
	});

	it('valor vazio vira só zeros', () => {
		expect(padNum('', 3)).toBe('000');
	});
});

describe('padAlpha (campo A)', () => {
	it('completa com espaços à direita', () => {
		expect(padAlpha('ABC', 6)).toBe('ABC   ');
	});

	it('trunca no tamanho do campo', () => {
		expect(padAlpha('ABCDEFGH', 4)).toBe('ABCD');
	});

	it('null/undefined viram campo em branco', () => {
		expect(padAlpha(null, 3)).toBe('   ');
		expect(padAlpha(undefined, 2)).toBe('  ');
	});

	it('mantém acentos do ISO-8859-1 e troca o que está fora dele por "?"', () => {
		expect(padAlpha('João — Ação', 11)).toBe('João ? Ação');
	});
});

describe('datas no fuso de Brasília', () => {
	it('toDH converte UTC para -0300 e zera os segundos', () => {
		expect(toDH(new Date('2026-01-05T11:07:45Z'))).toBe('2026-01-05T08:07:00-0300');
	});

	it('toDH vira o dia quando UTC já passou da meia-noite', () => {
		expect(toDH(new Date('2026-01-01T02:30:00Z'))).toBe('2025-12-31T23:30:00-0300');
	});

	it('toD usa a data de Brasília', () => {
		expect(toD(new Date('2026-03-01T01:00:00Z'))).toBe('2026-02-28');
	});
});

describe('crc16kermit', () => {
	it('bate com o valor de referência do leiaute ("123456789" → 2189)', () => {
		expect(crc16kermit('123456789')).toBe('2189');
	});

	it('retorna sempre 4 hex maiúsculos', () => {
		expect(crc16kermit('')).toBe('0000');
		expect(crc16kermit('A')).toMatch(/^[0-9A-F]{4}$/);
	});

	it('muda quando um único caractere muda', () => {
		expect(crc16kermit('000000001')).not.toBe(crc16kermit('000000002'));
	});
});
