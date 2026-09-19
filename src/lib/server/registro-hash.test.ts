import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalRegistro, hashRegistro, type RegistroChainInput } from './registro-hash';

const batida: RegistroChainInput = {
	nsr: 1n,
	marcadoEm: new Date('2026-01-05T11:00:00Z'), // 08:00 em Brasília
	cpf: '12345678901',
	registradoEm: new Date('2026-01-05T11:00:30Z')
};

// Campos do registro tipo 7 montados à mão, na ordem do leiaute:
// NSR(9) | tipo | DH marcação | CPF(12) | DH gravação | coletor | on-line
const CANONICO_ESPERADO =
	'000000001' +
	'7' +
	'2026-01-05T08:00:00-0300' +
	'012345678901' +
	'2026-01-05T08:00:00-0300' +
	'02' +
	'0';

function sha256(s: string): string {
	return createHash('sha256').update(s, 'latin1').digest('hex');
}

describe('canonicalRegistro', () => {
	it('segue a ordem e os tamanhos do registro tipo 7', () => {
		expect(canonicalRegistro(batida, null)).toBe(CANONICO_ESPERADO);
	});

	it('anexa o hash anterior ao final', () => {
		expect(canonicalRegistro(batida, 'abc')).toBe(CANONICO_ESPERADO + 'abc');
	});
});

describe('hashRegistro', () => {
	it('é o SHA-256 (hex) do conteúdo canônico', () => {
		expect(hashRegistro(batida, null)).toBe(sha256(CANONICO_ESPERADO));
	});

	it('tem 64 caracteres hex (campo 8 do tipo 7)', () => {
		expect(hashRegistro(batida, null)).toMatch(/^[0-9a-f]{64}$/);
	});

	it('encadeia: o mesmo registro com outro elo anterior gera outro hash', () => {
		const h1 = hashRegistro(batida, null);
		const h2 = hashRegistro(batida, h1);
		expect(h2).toBe(sha256(CANONICO_ESPERADO + h1));
		expect(h2).not.toBe(h1);
	});

	it.each([
		['NSR', { nsr: 2n }],
		['horário da marcação', { marcadoEm: new Date('2026-01-05T11:01:00Z') }],
		['CPF', { cpf: '12345678902' }],
		['horário de gravação', { registradoEm: new Date('2026-01-05T11:05:00Z') }]
	])('muda quando o campo "%s" é alterado', (_, alteracao) => {
		expect(hashRegistro({ ...batida, ...alteracao }, null)).not.toBe(hashRegistro(batida, null));
	});

	it('ignora os segundos (o leiaute grava DH com ":00")', () => {
		const comSegundos = { ...batida, marcadoEm: new Date('2026-01-05T11:00:59Z') };
		expect(hashRegistro(comSegundos, null)).toBe(hashRegistro(batida, null));
	});
});
