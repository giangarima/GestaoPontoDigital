import { describe, expect, it } from 'vitest';
import { capitalizar, formatHoursMinutes } from './date';

describe('capitalizar', () => {
	it('só a primeira letra', () => {
		expect(capitalizar('sábado, 17 de outubro')).toBe('Sábado, 17 de outubro');
		expect(capitalizar('')).toBe('');
	});
});

describe('formatHoursMinutes', () => {
	it('abaixo de uma hora, só os minutos', () => {
		expect(formatHoursMinutes(-55)).toBe('-55min');
		expect(formatHoursMinutes(0)).toBe('0min');
		expect(formatHoursMinutes(125)).toBe('2h 05min');
	});
});
