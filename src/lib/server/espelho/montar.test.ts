import { describe, expect, it } from 'vitest';
import type { FeriadoDoDia } from '@/lib/server/feriado/calendario';
import { montarEspelho, type EspelhoEntrada, type MarcacaoEspelho } from './montar';

const brt = (s: string) => new Date(`${s}:00-03:00`);
const util = (entrada: string, saidaAlmoco: string, retorno: string, saida: string) => ({
	ativo: true,
	entrada,
	saida_almoco: saidaAlmoco,
	retorno_almoco: retorno,
	saida
});
const folga = { ativo: false, entrada: '', saida_almoco: '', retorno_almoco: '', saida: '' };
const comercial = util('08:00', '12:00', '13:00', '17:00');

function original(iso: string, nsr: number, anulacao: string | null = null): MarcacaoEspelho {
	return {
		marcadoEm: brt(iso),
		fonte: 'O',
		nsr: BigInt(nsr),
		criadoMotivo: null,
		anulacao: anulacao ? { motivo: anulacao } : null
	};
}

function inclusao(iso: string, motivo: string): MarcacaoEspelho {
	return { marcadoEm: brt(iso), fonte: 'I', nsr: null, criadoMotivo: motivo, anulacao: null };
}

/** Semana de 04/01/2026 (domingo) a 10/01/2026 (sábado), emitida em 12/01. */
function entrada(extra: Partial<EspelhoEntrada> = {}): EspelhoEntrada {
	return {
		empresa: { razaoSocial: 'Empresa Teste Ltda', cnpj: '12345678000199', caepfCno: null },
		trabalhador: {
			nome: 'José da Conceição',
			cpf: '12345678901',
			admissao: new Date('2025-01-01T00:00:00Z'),
			desligamento: null,
			cargo: 'Analista'
		},
		inicio: '2026-01-04',
		fim: '2026-01-10',
		emitidoEm: brt('2026-01-12T09:00'),
		versoes: [
			{
				vigenciaInicio: new Date('2020-01-01T00:00:00Z'),
				dias: {
					segunda: comercial,
					terca: comercial,
					quarta: comercial,
					quinta: comercial,
					sexta: util('08:00', '', '', '12:00'),
					sabado: folga,
					domingo: folga
				}
			}
		],
		ausencias: [],
		feriados: new Map(),
		marcacoes: [],
		...extra
	};
}

const diaDe = (esp: ReturnType<typeof montarEspelho>, dia: string) =>
	esp.dias.find((d) => d.dia === dia)!;

describe('montarEspelho', () => {
	it('lista todos os dias do período, com DSR, folga e falta', () => {
		const esp = montarEspelho(entrada());

		expect(esp.dias.map((d) => `${d.semana} ${d.ocorrencia}`)).toEqual([
			'Dom DSR',
			'Seg Falta',
			'Ter Falta',
			'Qua Falta',
			'Qui Falta',
			'Sex Falta',
			'Sáb Folga'
		]);
		// Falta conta o dia contratual inteiro; a sexta (sem intervalo) tem 4h.
		expect(esp.totais).toMatchObject({ faltas: 5, deficitMin: 4 * 480 + 240, realizadoMin: 0 });
	});

	it('códigos de horário contratual distintos (H1 8h, H2 sexta de 4h)', () => {
		const esp = montarEspelho(entrada());
		expect(esp.horarios).toEqual([
			{
				codigo: 'H1',
				pares: [
					['08:00', '12:00'],
					['13:00', '17:00']
				],
				minutos: 480
			},
			{ codigo: 'H2', pares: [['08:00', '12:00']], minutos: 240 }
		]);
		expect(diaDe(esp, '2026-01-09').horario).toBe('H2');
		expect(diaDe(esp, '2026-01-04').horario).toBeNull();
	});

	it('ausência aprovada abona o dia com o rótulo do tipo', () => {
		const esp = montarEspelho(
			entrada({
				ausencias: [
					{
						tipo: 'atestado',
						dataInicio: new Date('2026-01-05T00:00:00Z'),
						dataFim: new Date('2026-01-06T00:00:00Z')
					}
				]
			})
		);
		expect(diaDe(esp, '2026-01-05')).toMatchObject({ ocorrencia: 'Atestado', deficitMin: 0 });
		expect(diaDe(esp, '2026-01-06')).toMatchObject({ ocorrencia: 'Atestado', falta: false });
		expect(esp.totais.faltas).toBe(3);
	});

	it('tratamento: inclusão conta, desconsiderada não; ambas vão para a lista com o motivo', () => {
		const esp = montarEspelho(
			entrada({
				marcacoes: [
					original('2026-01-05T08:40', 1, 'Relógio adiantado'),
					inclusao('2026-01-05T08:00', 'Relógio adiantado'),
					original('2026-01-05T12:00', 2),
					original('2026-01-05T13:00', 3),
					original('2026-01-05T17:30', 4)
				]
			})
		);
		const seg = diaDe(esp, '2026-01-05');

		expect(seg.marcacoes.map((m) => [m.fonte, m.desconsiderada, m.nsr])).toEqual([
			['I', false, null],
			['O', true, '1'],
			['O', false, '2'],
			['O', false, '3'],
			['O', false, '4']
		]);
		expect(seg).toMatchObject({ realizadoMin: 510, extraMin: 30, deficitMin: 0, ocorrencia: '' });
		expect(esp.tratamentos).toEqual([
			{ marcadoEm: brt('2026-01-05T08:00'), tipo: 'Incluída', motivo: 'Relógio adiantado' },
			{ marcadoEm: brt('2026-01-05T08:40'), tipo: 'Desconsiderada', motivo: 'Relógio adiantado' }
		]);
	});

	it('visão original: só as marcações do REP, todas válidas, sem tratamentos', () => {
		const esp = montarEspelho(
			entrada({
				marcacoes: [
					original('2026-01-05T08:40', 1, 'Relógio adiantado'),
					inclusao('2026-01-05T08:00', 'Relógio adiantado'),
					original('2026-01-05T12:00', 2),
					original('2026-01-05T13:00', 3),
					original('2026-01-05T17:30', 4)
				]
			}),
			{ visao: 'original' }
		);
		expect(diaDe(esp, '2026-01-05')).toMatchObject({ realizadoMin: 470, deficitMin: 10 });
		expect(esp.tratamentos).toEqual([]);
	});

	it('tolerância da CLT: variações pequenas não geram déficit e aparecem na ocorrência', () => {
		const esp = montarEspelho(
			entrada({
				marcacoes: [
					original('2026-01-05T08:03', 1),
					original('2026-01-05T12:00', 2),
					original('2026-01-05T13:00', 3),
					original('2026-01-05T16:57', 4)
				]
			})
		);
		expect(diaDe(esp, '2026-01-05')).toMatchObject({
			realizadoMin: 474,
			extraMin: 0,
			deficitMin: 0,
			toleranciaMin: 6,
			ocorrencia: 'Tolerância (6 min)'
		});
	});

	it('variações somando mais de 10 min no dia: conta o tempo real', () => {
		const esp = montarEspelho(
			entrada({
				marcacoes: [
					original('2026-01-05T08:03', 1),
					original('2026-01-05T11:57', 2),
					original('2026-01-05T13:03', 3),
					original('2026-01-05T16:57', 4)
				]
			})
		);
		expect(diaDe(esp, '2026-01-05')).toMatchObject({
			realizadoMin: 468,
			deficitMin: 12,
			toleranciaMin: 0,
			ocorrencia: ''
		});
	});

	it('marcação ímpar no passado fica "Incompleto", sem déficit', () => {
		const esp = montarEspelho(
			entrada({
				marcacoes: [
					original('2026-01-05T08:00', 1),
					original('2026-01-05T12:00', 2),
					original('2026-01-05T13:00', 3)
				]
			})
		);
		expect(diaDe(esp, '2026-01-05')).toMatchObject({
			ocorrencia: 'Incompleto',
			realizadoMin: 240,
			deficitMin: 0
		});
		expect(esp.totais.diasEmAberto).toBe(1);
	});

	it('marcação ímpar hoje ainda não é dia em aberto', () => {
		const esp = montarEspelho(
			entrada({
				emitidoEm: brt('2026-01-05T09:00'),
				marcacoes: [original('2026-01-05T08:00', 1)]
			})
		);
		expect(esp.totais.diasEmAberto).toBe(0);
	});

	it('hoje e dias futuros estão em andamento: sem falta', () => {
		const esp = montarEspelho(entrada({ emitidoEm: brt('2026-01-07T09:00') }));
		expect(esp.dias.filter((d) => d.falta).map((d) => d.dia)).toEqual(['2026-01-05', '2026-01-06']);
	});

	it('dias fora do vínculo (antes da admissão) não viram falta', () => {
		const esp = montarEspelho(
			entrada({
				trabalhador: {
					...entrada().trabalhador,
					admissao: new Date('2026-01-07T00:00:00Z')
				}
			})
		);
		expect(diaDe(esp, '2026-01-05')).toMatchObject({ ocorrencia: 'Fora do vínculo', falta: false });
		expect(esp.totais.faltas).toBe(3);
	});

	it('sem jornada: não aponta falta, extras nem déficit', () => {
		const esp = montarEspelho(
			entrada({
				versoes: [],
				marcacoes: [original('2026-01-05T08:00', 1), original('2026-01-05T18:00', 2)]
			})
		);
		expect(esp.semJornada).toBe(true);
		expect(esp.totais).toMatchObject({ faltas: 0, extraMin: 0, deficitMin: 0, realizadoMin: 600 });
	});

	it('batida noturna fica no dia de Brasília e usa a hora reduzida', () => {
		const esp = montarEspelho(
			entrada({
				marcacoes: [original('2026-01-10T22:00', 1), original('2026-01-10T23:45', 2)]
			})
		);
		// Sábado de folga: 105 min de relógio, todos noturnos → 120 min.
		expect(diaDe(esp, '2026-01-10')).toMatchObject({
			realizadoMin: 120,
			noturnoMin: 105,
			extraMin: 120,
			ocorrencia: ''
		});
	});
});

describe('previsto do período (base do consolidado)', () => {
	it('semana encerrada: dias com expediente e a jornada contratual somada', () => {
		const esp = montarEspelho(entrada());
		expect(esp.totais).toMatchObject({ diasPrevistos: 5, previstoMin: 4 * 480 + 240 });
	});

	it('conta até hoje, inclusive; dias futuros ficam de fora', () => {
		const esp = montarEspelho(entrada({ emitidoEm: brt('2026-01-07T09:00') }));
		// seg, ter e qua (hoje)
		expect(esp.totais).toMatchObject({ diasPrevistos: 3, previstoMin: 3 * 480 });
	});

	it('ausência aprovada e dias fora do vínculo não entram no previsto', () => {
		const esp = montarEspelho(
			entrada({
				trabalhador: { ...entrada().trabalhador, admissao: new Date('2026-01-06T00:00:00Z') },
				ausencias: [
					{
						tipo: 'atestado',
						dataInicio: new Date('2026-01-07T00:00:00Z'),
						dataFim: new Date('2026-01-07T00:00:00Z')
					}
				]
			})
		);
		// ter, qui e sex: segunda é antes da admissão, quarta está abonada.
		expect(esp.totais).toMatchObject({ diasPrevistos: 3, previstoMin: 2 * 480 + 240 });
	});

	it('trabalhados + faltas + dias em aberto sem par fecham com o previsto', () => {
		const esp = montarEspelho(
			entrada({
				marcacoes: [
					original('2026-01-05T08:00', 1),
					original('2026-01-05T17:00', 2),
					original('2026-01-06T08:00', 3) // em aberto, sem nenhum par
				]
			})
		);
		const emAbertoSemPar = esp.dias.filter(
			(d) => d.ocorrencia === 'Incompleto' && d.realizadoMin === 0
		).length;
		expect(esp.totais.diasTrabalhados + esp.totais.faltas + emAbertoSemPar).toBe(
			esp.totais.diasPrevistos
		);
	});

	it('sem jornada: nada previsto', () => {
		const esp = montarEspelho(entrada({ versoes: [] }));
		expect(esp.totais).toMatchObject({ diasPrevistos: 0, previstoMin: 0 });
	});
});

const feriado = (nome: string, extra: Partial<FeriadoDoDia> = {}): FeriadoDoDia => ({
	nome,
	tipo: 'feriado',
	abrangencia: 'municipal',
	escalado: false,
	...extra
});

describe('feriados', () => {
	const feriados = new Map([['2026-01-06', feriado('Dia de Reis')]]);

	it('feriado sem marcação: nem falta, nem déficit, fora do previsto', () => {
		const esp = montarEspelho(entrada({ feriados }));
		expect(diaDe(esp, '2026-01-06')).toMatchObject({
			ocorrencia: 'Feriado (Dia de Reis)',
			feriado: { nome: 'Dia de Reis', escalado: false },
			falta: false,
			deficitMin: 0,
			horario: null
		});
		expect(esp.totais).toMatchObject({ faltas: 4, diasPrevistos: 4, previstoMin: 3 * 480 + 240 });
	});

	it('trabalho no feriado fora da escala é todo extra, sem tolerância', () => {
		const esp = montarEspelho(
			entrada({
				feriados,
				marcacoes: [original('2026-01-06T08:02', 1), original('2026-01-06T12:00', 2)]
			})
		);
		expect(diaDe(esp, '2026-01-06')).toMatchObject({
			realizadoMin: 238,
			extraMin: 238,
			deficitMin: 0,
			toleranciaMin: 0,
			ocorrencia: 'Feriado (Dia de Reis)'
		});
	});

	it('escalado no feriado: segue a jornada e leva falta se não vier', () => {
		const esp = montarEspelho(
			entrada({ feriados: new Map([['2026-01-06', feriado('Dia de Reis', { escalado: true })]]) })
		);
		expect(diaDe(esp, '2026-01-06')).toMatchObject({ falta: true, deficitMin: 480, horario: 'H1' });
		expect(esp.totais.diasPrevistos).toBe(5);
	});

	it('escalado que trabalhou: feriado trabalhado, apurado contra a jornada', () => {
		const esp = montarEspelho(
			entrada({
				feriados: new Map([['2026-01-06', feriado('Dia de Reis', { escalado: true })]]),
				marcacoes: [
					original('2026-01-06T08:00', 1),
					original('2026-01-06T12:00', 2),
					original('2026-01-06T13:00', 3),
					original('2026-01-06T18:00', 4)
				]
			})
		);
		expect(diaDe(esp, '2026-01-06')).toMatchObject({
			ocorrencia: 'Feriado trabalhado (Dia de Reis)',
			realizadoMin: 540,
			extraMin: 60,
			falta: false
		});
	});

	it('ponto facultativo dispensado: sem expediente, com rótulo próprio', () => {
		const esp = montarEspelho(
			entrada({
				feriados: new Map([['2026-01-06', feriado('Carnaval', { tipo: 'ponto_facultativo' })]])
			})
		);
		expect(diaDe(esp, '2026-01-06')).toMatchObject({
			ocorrencia: 'Ponto facultativo (Carnaval)',
			falta: false
		});
	});

	it('ausência aprovada no feriado mantém o rótulo da ausência', () => {
		const esp = montarEspelho(
			entrada({
				feriados,
				ausencias: [
					{
						tipo: 'ferias',
						dataInicio: new Date('2026-01-05T00:00:00Z'),
						dataFim: new Date('2026-01-09T00:00:00Z')
					}
				]
			})
		);
		expect(diaDe(esp, '2026-01-06')).toMatchObject({ ocorrencia: 'Férias' });
	});

	it('feriado em dia de folga continua feriado no rótulo', () => {
		const esp = montarEspelho(entrada({ feriados: new Map([['2026-01-04', feriado('X')]]) }));
		expect(diaDe(esp, '2026-01-04').ocorrencia).toBe('Feriado (X)');
	});
});
