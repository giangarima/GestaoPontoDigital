import { describe, expect, it } from 'vitest';
import { ausenciaDateKeys, buildDailySummaries, type RegistroComAnulacao } from './timesheet';

/** Jornada de 8h todo dia (para os testes de agrupamento). */
const oitoHoras = { contratualMin: () => 480, hoje: '2099-01-01' };

let seq = 0;
function batida(tipo: string, iso: string): RegistroComAnulacao {
	seq++;
	return {
		id: `r${seq}`,
		colaboradorId: 'c1',
		empresaId: 'e1',
		tipo,
		marcadoEm: new Date(iso),
		metodo: 'manual',
		cpf: '12345678901',
		registradoEm: new Date(iso),
		fonte: 'O',
		nsr: BigInt(seq),
		hash: 'h',
		hashAnterior: null,
		criadoPor: null,
		criadoMotivo: null,
		anulacao: null
	};
}

describe('buildDailySummaries: dia de Brasília', () => {
	it('turno da tarde/noite que termina às 23:00 fica todo no mesmo dia', () => {
		// 05/01 14:00–18:00 e 19:00–23:00 (BRT); as duas últimas já são 06/01 em UTC.
		const dias = buildDailySummaries(
			[
				batida('entrada', '2026-01-05T14:00:00-03:00'),
				batida('saida_almoco', '2026-01-05T18:00:00-03:00'),
				batida('retorno_almoco', '2026-01-05T21:30:00-03:00'),
				batida('saida', '2026-01-05T23:00:00-03:00')
			],
			oitoHoras
		);

		expect(dias.map((d) => d.date)).toEqual(['2026-01-05']);
		expect(dias[0].registros).toHaveLength(4);
		// 14–18h (4h) + 21:30–23h (60 min diurnos + 60 noturnos × 60/52,5) = 5h39
		expect(dias[0].totalHours).toBe(5.65);
	});

	it('batida à 00:30 de Brasília vai para o dia seguinte', () => {
		const dias = buildDailySummaries(
			[
				batida('entrada', '2026-01-05T08:00:00-03:00'),
				batida('entrada', '2026-01-06T00:30:00-03:00')
			],
			oitoHoras
		);
		expect(dias.map((d) => d.date)).toEqual(['2026-01-05', '2026-01-06']);
	});
});

describe('buildDailySummaries: jornada contratual', () => {
	const meioPeriodo = [
		batida('entrada', '2026-01-05T08:00:00-03:00'),
		batida('saida_almoco', '2026-01-05T10:00:00-03:00'),
		batida('retorno_almoco', '2026-01-05T10:15:00-03:00'),
		batida('saida', '2026-01-05T12:00:00-03:00')
	];

	it('meio período (3h45 contratuais) não gera déficit contra 8h fixas', () => {
		const [dia] = buildDailySummaries(meioPeriodo, {
			contratualMin: () => 225,
			hoje: '2026-02-01'
		});
		expect(dia).toMatchObject({ totalHours: 3.75, overtime: 0, deficit: 0 });
	});

	it('déficit e extras contra a jornada do dia', () => {
		const [curto] = buildDailySummaries(meioPeriodo, {
			contratualMin: () => 240,
			hoje: '2026-02-01'
		});
		expect(curto.deficit).toBe(0.25);
		const [folga] = buildDailySummaries(meioPeriodo, {
			contratualMin: () => 0,
			hoje: '2026-02-01'
		});
		expect(folga.overtime).toBe(3.75);
	});

	it('anulada não conta; dia de hoje ainda em andamento não tem déficit', () => {
		const comAnulada = [...meioPeriodo];
		comAnulada[3] = { ...comAnulada[3], anulacao: {} as RegistroComAnulacao['anulacao'] };
		const [passado] = buildDailySummaries(comAnulada.slice(0, 2), {
			contratualMin: () => 225,
			hoje: '2026-02-01'
		});
		expect(passado.deficit).toBe(1.75);
		const [hoje] = buildDailySummaries(comAnulada.slice(0, 2), {
			contratualMin: () => 225,
			hoje: '2026-01-05'
		});
		expect(hoje.deficit).toBe(0);
	});
});

describe('ausenciaDateKeys', () => {
	it('expande o intervalo de datas puras sem deslocar o dia', () => {
		const keys = ausenciaDateKeys([
			{ dataInicio: new Date('2026-01-30T00:00:00Z'), dataFim: new Date('2026-02-02T00:00:00Z') }
		]);
		expect([...keys]).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
	});
});
