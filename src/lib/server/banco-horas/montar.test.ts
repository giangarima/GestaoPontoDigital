import { describe, expect, it } from 'vitest';
import type { DiaEspelho } from '@/lib/server/espelho/montar';
import { ciclosAte, montarCiclo, movimentoDoDia } from './montar';

function dia(d: string, extra: Partial<DiaEspelho> = {}): DiaEspelho {
	return {
		dia: d,
		semana: 'Seg',
		horario: 'H1',
		marcacoes: [],
		realizadoMin: 480,
		noturnoMin: 0,
		extraMin: 0,
		deficitMin: 0,
		ocorrencia: '',
		feriado: null,
		contratualMin: 480,
		ausenciaTipo: null,
		falta: false,
		toleranciaMin: 0,
		...extra
	};
}

describe('ciclosAte', () => {
	it('semestral a partir de 01/03: ciclos de seis meses', () => {
		const config = {
			regime: 'semestral' as const,
			inicio: '2026-03-01',
			negativo: 'zerar' as const
		};
		expect(ciclosAte(config, '2026-10-12')).toEqual([
			{ inicio: '2026-03-01', fim: '2026-08-31' },
			{ inicio: '2026-09-01', fim: '2027-02-28' }
		]);
	});

	it('mensal começando no dia 31 não estoura o mês', () => {
		const config = { regime: 'mensal' as const, inicio: '2026-01-31', negativo: 'zerar' as const };
		expect(ciclosAte(config, '2026-03-15')).toEqual([
			{ inicio: '2026-01-31', fim: '2026-02-27' },
			{ inicio: '2026-02-28', fim: '2026-03-30' }
		]);
	});

	it('anual; antes do início, nenhum ciclo', () => {
		const config = { regime: 'anual' as const, inicio: '2026-01-01', negativo: 'zerar' as const };
		expect(ciclosAte(config, '2026-12-31')).toEqual([{ inicio: '2026-01-01', fim: '2026-12-31' }]);
		expect(ciclosAte(config, '2025-12-31')).toEqual([]);
	});
});

describe('movimentoDoDia', () => {
	it('extra credita e déficit de dia trabalhado debita', () => {
		expect(movimentoDoDia(dia('2026-03-02', { extraMin: 30 }))?.creditoMin).toBe(30);
		expect(movimentoDoDia(dia('2026-03-02', { deficitMin: 20 }))?.debitoMin).toBe(20);
	});

	it('falta fica fora do banco', () => {
		expect(movimentoDoDia(dia('2026-03-02', { falta: true, deficitMin: 480 }))).toBeNull();
	});

	it('folga compensatória consome o contratual do dia', () => {
		const m = movimentoDoDia(dia('2026-03-02', { ausenciaTipo: 'folga', realizadoMin: 0 }));
		expect(m).toMatchObject({ folgaMin: 480, debitoMin: 0 });
	});

	it('atestado e férias não mexem no banco', () => {
		expect(movimentoDoDia(dia('2026-03-02', { ausenciaTipo: 'atestado' }))).toBeNull();
	});
});

describe('montarCiclo', () => {
	const ciclo = { inicio: '2026-03-01', fim: '2026-03-31' };
	const dias = [
		dia('2026-02-28', { extraMin: 999 }), // fora do ciclo
		dia('2026-03-02', { extraMin: 120 }),
		dia('2026-03-03', { deficitMin: 30 }),
		dia('2026-03-04', { ausenciaTipo: 'folga', realizadoMin: 0 }),
		dia('2026-03-05', { falta: true, deficitMin: 480 }),
		dia('2026-03-10', { extraMin: 60 }) // hoje: em andamento
	];

	it('ciclo aberto: soma até ontem, sem resultado', () => {
		const c = montarCiclo(ciclo, dias, '2026-03-10', 'zerar');
		expect(c).toMatchObject({
			creditoMin: 120,
			debitoMin: 30,
			folgaMin: 480,
			saldoMin: -390,
			encerrado: false,
			resultado: null
		});
		expect(c.movimentos.map((m) => m.dia)).toEqual(['2026-03-02', '2026-03-03', '2026-03-04']);
	});

	it('vencido com saldo negativo: zera ou desconta conforme a empresa', () => {
		expect(montarCiclo(ciclo, dias, '2026-04-02', 'zerar')).toMatchObject({
			encerrado: true,
			resultado: 'zerado',
			resultadoMin: 330
		});
		expect(montarCiclo(ciclo, dias, '2026-04-02', 'descontar').resultado).toBe('descontar');
	});

	it('vencido com saldo positivo: a pagar como extra', () => {
		const c = montarCiclo(ciclo, [dia('2026-03-02', { extraMin: 90 })], '2026-04-01', 'zerar');
		expect(c).toMatchObject({ resultado: 'pagar', resultadoMin: 90 });
	});
});
