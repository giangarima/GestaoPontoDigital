import { describe, expect, it } from 'vitest';
import {
	apurarPeriodo,
	type ApuracaoEntrada,
	type MarcacaoEspelho
} from '@/lib/server/espelho/montar';
import { dataPura } from '@/lib/server/periodo';
import {
	desviosDoDia,
	faixaDaChegada,
	inicioDaSemana,
	intervalosDoPeriodo,
	montarPerfil
} from './montar';

const brt = (s: string) => new Date(`${s}:00-03:00`);
const util = {
	ativo: true,
	entrada: '08:00',
	saida_almoco: '12:00',
	retorno_almoco: '13:00',
	saida: '17:00'
};
const folga = { ativo: false, entrada: '', saida_almoco: '', retorno_almoco: '', saida: '' };
const VERSOES = [
	{
		vigenciaInicio: new Date('2020-01-01T00:00:00Z'),
		dias: {
			segunda: util,
			terca: util,
			quarta: util,
			quinta: util,
			sexta: util,
			sabado: folga,
			domingo: folga
		}
	}
];

let nsr = 0;
function batidas(dia: string, horas: string[], fonte: 'O' | 'I' = 'O'): MarcacaoEspelho[] {
	return horas.map((h) => ({
		marcadoEm: brt(`${dia}T${h}`),
		fonte,
		nsr: fonte === 'O' ? BigInt(++nsr) : null,
		criadoMotivo: fonte === 'I' ? 'esqueceu' : null,
		anulacao: null
	}));
}

const PADRAO = ['08:00', '12:00', '13:00', '17:00'];

/** Semana de segunda 05/01/2026 a domingo 11/01/2026, apurada em 12/01. */
function apurar(marcacoes: MarcacaoEspelho[], extra: Partial<ApuracaoEntrada> = {}) {
	return apurarPeriodo({
		inicio: '2026-01-05',
		fim: '2026-01-11',
		emitidoEm: brt('2026-01-12T09:00'),
		versoes: VERSOES,
		escala: null,
		ausencias: [],
		feriados: new Map(),
		marcacoes,
		admissao: null,
		desligamento: null,
		...extra
	});
}

const dia = (ap: ReturnType<typeof apurar>, d: string) => ap.dias.find((x) => x.dia === d)!;
const PARES: [string, string][] = [
	['08:00', '12:00'],
	['13:00', '17:00']
];

describe('desviosDoDia', () => {
	it('5 min de atraso ainda é pontual; 6 min é atraso', () => {
		const ap = apurar([
			...batidas('2026-01-05', ['08:05', '12:00', '13:00', '17:00']),
			...batidas('2026-01-06', ['08:06', '12:00', '13:00', '17:00'])
		]);
		expect(desviosDoDia(dia(ap, '2026-01-05'), PARES)).toMatchObject({
			chegadaMin: 5,
			atraso: false
		});
		expect(desviosDoDia(dia(ap, '2026-01-06'), PARES)).toMatchObject({
			chegadaMin: 6,
			atraso: true
		});
	});

	it('chegar cedo é chegada negativa', () => {
		const ap = apurar(batidas('2026-01-05', ['07:40', '12:00', '13:00', '17:00']));
		expect(desviosDoDia(dia(ap, '2026-01-05'), PARES).chegadaMin).toBe(-20);
	});

	it('saída antecipada só acima de 5 min e só com par fechado', () => {
		const ap = apurar([
			...batidas('2026-01-05', ['08:00', '12:00', '13:00', '16:30']),
			...batidas('2026-01-06', ['08:00', '12:00', '13:00', '16:56']),
			...batidas('2026-01-07', ['08:00', '12:00', '13:00'])
		]);
		expect(desviosDoDia(dia(ap, '2026-01-05'), PARES).saidaAntecipadaMin).toBe(30);
		expect(desviosDoDia(dia(ap, '2026-01-06'), PARES).saidaAntecipadaMin).toBeNull();
		expect(desviosDoDia(dia(ap, '2026-01-07'), PARES).saidaAntecipadaMin).toBeNull();
	});

	it('intervalo realizado contra o previsto', () => {
		const ap = apurar([
			...batidas('2026-01-05', ['08:00', '12:00', '12:30', '17:00']),
			...batidas('2026-01-06', ['08:00', '12:00', '13:20', '17:00'])
		]);
		expect(desviosDoDia(dia(ap, '2026-01-05'), PARES).intervaloDifMin).toBe(-30);
		expect(desviosDoDia(dia(ap, '2026-01-06'), PARES).intervaloDifMin).toBe(20);
	});

	it('marcação desconsiderada não conta como chegada', () => {
		const ms = batidas('2026-01-05', ['07:00', '08:20', '12:00', '13:00', '17:00']);
		ms[0].anulacao = { motivo: 'duplicada' };
		const ap = apurar(ms);
		expect(desviosDoDia(dia(ap, '2026-01-05'), PARES).chegadaMin).toBe(20);
	});

	it('sem horário (folga) ou sem marcação não avalia', () => {
		const ap = apurar(batidas('2026-01-10', PADRAO));
		expect(desviosDoDia(dia(ap, '2026-01-10'), null).chegadaMin).toBeNull();
		expect(desviosDoDia(dia(ap, '2026-01-05'), PARES).chegadaMin).toBeNull();
	});
});

describe('montarPerfil', () => {
	// seg pontual, ter 20 min atrasada, qua falta, qui esqueceu a saída, sex atestado,
	// sáb trabalhou na folga.
	const ap = apurar(
		[
			...batidas('2026-01-05', PADRAO),
			...batidas('2026-01-06', ['08:20', '12:00', '13:00', '17:00']),
			...batidas('2026-01-08', ['08:00', '12:00', '13:00']),
			...batidas('2026-01-10', ['09:00', '12:00'])
		],
		{
			ausencias: [
				{ tipo: 'atestado', dataInicio: dataPura('2026-01-09'), dataFim: dataPura('2026-01-09') }
			]
		}
	);
	const perfil = montarPerfil(
		ap,
		['dentro', 'fora', null, 'sem_localizacao', 'sem_locais'],
		'semana'
	);

	it('pontualidade conta só dias com expediente e marcação, sem ausência', () => {
		expect(perfil.resumo.pontualidade).toEqual({
			diasAvaliados: 3, // seg, ter, qui (qua faltou, sex atestado, sáb é folga)
			diasComAtraso: 1,
			percentualNoHorario: 66.7,
			atrasoMedioMin: 20,
			maiorAtrasoMin: 20,
			atrasoTotalMin: 20
		});
	});

	it('assiduidade vem dos totais do espelho', () => {
		expect(perfil.resumo.assiduidade).toMatchObject({
			faltas: ap.totais.faltas,
			diasEmAberto: ap.totais.diasEmAberto,
			diasAtestado: 1,
			diasFerias: 0,
			inclusoes: 0
		});
		expect(perfil.resumo.assiduidade.faltas).toBe(1);
		expect(perfil.resumo.assiduidade.diasEmAberto).toBe(1);
	});

	it('horas são as do espelho, sem recálculo', () => {
		expect(perfil.resumo.horas).toMatchObject({
			realizadoMin: ap.totais.realizadoMin,
			previstoMin: ap.totais.previstoMin,
			extraMin: ap.totais.extraMin,
			deficitMin: ap.totais.deficitMin
		});
	});

	it('local: só dentro/fora/sem_localizacao contam como conferidas', () => {
		expect(perfil.resumo.local).toEqual({ batidas: 5, conferidas: 3, fora: 1, semLocalizacao: 1 });
	});

	it('calendário classifica cada dia', () => {
		expect(perfil.dias.map((d) => d.situacao)).toEqual([
			'no_horario',
			'atraso',
			'falta',
			'aberto',
			'ausencia',
			'folga',
			'folga'
		]);
	});

	it('série semanal agrupa pela segunda-feira', () => {
		expect(perfil.serie).toEqual([
			{
				chave: '2026-01-05',
				diasAvaliados: 3,
				diasComAtraso: 1,
				percentualAtraso: 33.3,
				atrasoMedioMin: 20,
				faltas: 1
			}
		]);
	});

	it('padrão por dia da semana: o atraso cai na terça', () => {
		const terca = perfil.porDiaSemana[2];
		expect(terca).toMatchObject({ diasAvaliados: 1, diasComAtraso: 1, percentualAtraso: 100 });
		expect(perfil.porDiaSemana[0].percentualAtraso).toBeNull();
	});

	it('histograma da chegada', () => {
		expect(perfil.chegada).toEqual({ antes: 0, pontual: 2, ate15: 0, ate30: 1, acima30: 0 });
	});

	it('inclusão do admin aparece na assiduidade', () => {
		const comInclusao = apurar([
			...batidas('2026-01-05', ['08:00', '12:00', '13:00']),
			...batidas('2026-01-05', ['17:00'], 'I')
		]);
		expect(montarPerfil(comInclusao, [], 'semana').resumo.assiduidade.inclusoes).toBe(1);
	});

	it('período sem dado avaliado não inventa percentual', () => {
		const vazio = montarPerfil(apurar([], { admissao: dataPura('2026-02-01') }), [], 'mes');
		expect(vazio.resumo.pontualidade.percentualNoHorario).toBeNull();
		expect(vazio.resumo.pontualidade.atrasoMedioMin).toBeNull();
		expect(vazio.serie).toEqual([
			expect.objectContaining({ chave: '2026-01', diasAvaliados: 0, percentualAtraso: null })
		]);
	});
});

describe('auxiliares', () => {
	it('intervalosDoPeriodo: atual termina ontem; anterior é contíguo e do mesmo tamanho', () => {
		const r = intervalosDoPeriodo('30d', brt('2026-10-17T10:00'));
		expect(r.atual).toEqual({ inicio: '2026-09-17', fim: '2026-10-16' });
		expect(r.anterior).toEqual({ inicio: '2026-08-18', fim: '2026-09-16' });
		expect(r.granularidade).toBe('semana');
		expect(intervalosDoPeriodo('6m', brt('2026-10-17T10:00')).granularidade).toBe('mes');
	});

	it('inicioDaSemana volta para a segunda (domingo é o fim da semana)', () => {
		expect(inicioDaSemana('2026-01-05')).toBe('2026-01-05');
		expect(inicioDaSemana('2026-01-11')).toBe('2026-01-05');
		expect(inicioDaSemana('2026-01-12')).toBe('2026-01-12');
	});

	it('faixaDaChegada', () => {
		expect(faixaDaChegada(-6)).toBe('antes');
		expect(faixaDaChegada(-5)).toBe('pontual');
		expect(faixaDaChegada(5)).toBe('pontual');
		expect(faixaDaChegada(15)).toBe('ate15');
		expect(faixaDaChegada(30)).toBe('ate30');
		expect(faixaDaChegada(31)).toBe('acima30');
	});
});
