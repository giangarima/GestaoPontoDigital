import { describe, expect, it } from 'vitest';
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
