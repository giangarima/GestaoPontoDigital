import { describe, expect, it } from 'vitest';
import { montarLinhaGrade, type AusenciaGrade } from './grade';

const util = {
	ativo: true,
	entrada: '08:00',
	saida_almoco: '12:00',
	retorno_almoco: '13:00',
	saida: '17:00'
};
/** Todos os dias com horário: a escala é que decide. */
const VERSOES = [
	{
		vigenciaInicio: new Date('2020-01-01T00:00:00Z'),
		dias: {
			segunda: util,
			terca: util,
			quarta: util,
			quinta: util,
			sexta: util,
			sabado: util,
			domingo: { ...util, ativo: false }
		}
	}
];

const ausencia = (id: string, tipo: string, inicio: string, fim = inicio): AusenciaGrade => ({
	id,
	tipo,
	dataInicio: new Date(`${inicio}T00:00:00Z`),
	dataFim: new Date(`${fim}T00:00:00Z`)
});

const sem = new Map();

// 2026-03-02 é segunda.
describe('montarLinhaGrade', () => {
	it('folga compensatória vira folga_banco com o id; férias viram ausencia', () => {
		const { dias } = montarLinhaGrade(
			VERSOES,
			null,
			sem,
			[ausencia('f1', 'folga', '2026-03-03'), ausencia('a1', 'ferias', '2026-03-04', '2026-03-05')],
			'c1',
			'2026-03-02',
			'2026-03-06',
			'2026-03-02'
		);
		expect(dias.map((d) => [d.dia, d.situacao, d.ausenciaId])).toEqual([
			['2026-03-02', 'trabalho', null],
			['2026-03-03', 'folga_banco', 'f1'],
			['2026-03-04', 'ausencia', 'a1'],
			['2026-03-05', 'ausencia', 'a1'],
			['2026-03-06', 'trabalho', null]
		]);
	});

	it('ausência prevalece sobre feriado; feriado fora da escala prevalece sobre trabalho', () => {
		const feriados = new Map([
			[
				'2026-03-03',
				{
					nome: 'X',
					tipo: 'feriado' as const,
					abrangencia: 'municipal' as const,
					escalados: new Set<string>()
				}
			],
			[
				'2026-03-04',
				{
					nome: 'Y',
					tipo: 'feriado' as const,
					abrangencia: 'municipal' as const,
					escalados: new Set(['c1'])
				}
			]
		]);
		const { dias } = montarLinhaGrade(
			VERSOES,
			null,
			feriados,
			[ausencia('a1', 'atestado', '2026-03-02')],
			'c1',
			'2026-03-02',
			'2026-03-04',
			'2026-03-02'
		);
		expect(dias.map((d) => d.situacao)).toEqual(['ausencia', 'feriado', 'trabalho']);
	});

	it('folga compensatória conta como descanso no alerta de dias seguidos', () => {
		const ajusteDomingo = new Map([['2026-03-08', true]]);
		const escala = { ciclos: [], ajustes: ajusteDomingo };
		const argumentos = ['c1', '2026-03-02', '2026-03-09', '2026-03-02'] as const;

		const semFolga = montarLinhaGrade(VERSOES, escala, sem, [], ...argumentos);
		expect(semFolga.alertas.map((a) => a.tipo)).toEqual(['sem_repouso']);

		const comFolga = montarLinhaGrade(
			VERSOES,
			escala,
			sem,
			[ausencia('f1', 'folga', '2026-03-05')],
			...argumentos
		);
		expect(comFolga.alertas).toEqual([]);
	});

	it('sem jornada: tudo sem_jornada e sem alertas', () => {
		const r = montarLinhaGrade([], null, sem, [], 'c1', '2026-03-02', '2026-03-03', '2026-03-02');
		expect(r.dias.map((d) => d.situacao)).toEqual(['sem_jornada', 'sem_jornada']);
		expect(r.alertas).toEqual([]);
	});

	it('só devolve dias a partir de mostrarDesde', () => {
		const r = montarLinhaGrade(
			VERSOES,
			null,
			sem,
			[],
			'c1',
			'2026-02-20',
			'2026-03-03',
			'2026-03-01'
		);
		expect(r.dias[0].dia).toBe('2026-03-01');
	});
});
