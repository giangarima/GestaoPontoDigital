import { describe, expect, it } from 'vitest';
import {
	apurarPeriodo,
	type ApuracaoEntrada,
	type MarcacaoEspelho
} from '@/lib/server/espelho/montar';
import { dataPura } from '@/lib/server/periodo';
import {
	chipDoDia,
	desviosDoDia,
	detalharDia,
	diaDeReferencia,
	inicioDaSemana,
	intervaloDoPeriodo,
	leituraDoDia,
	montarCards,
	montarSemana,
	periodosDisponiveis
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
const PADRAO = ['08:00', '12:00', '13:00', '17:00'];

let nsr = 0;
function batidas(
	dia: string,
	horas: string[],
	opcoes: { fonte?: 'O' | 'I'; anulada?: boolean } = {}
): MarcacaoEspelho[] {
	const fonte = opcoes.fonte ?? 'O';
	return horas.map((h) => ({
		marcadoEm: brt(`${dia}T${h}`),
		fonte,
		nsr: fonte === 'O' ? BigInt(++nsr) : null,
		criadoMotivo: fonte === 'I' ? 'Esqueceu de bater o ponto' : null,
		anulacao: opcoes.anulada ? { motivo: 'Marcação no mesmo minuto' } : null
	}));
}

/** Semana de segunda 05/01/2026 a domingo 11/01/2026, vista no domingo. */
const HOJE = '2026-01-11';
function detalhar(
	marcacoes: MarcacaoEspelho[],
	extra: Partial<ApuracaoEntrada> = {},
	hoje = HOJE,
	agora = brt(`${hoje}T09:00`)
) {
	const ap = apurarPeriodo({
		inicio: '2026-01-05',
		fim: hoje,
		emitidoEm: agora,
		versoes: VERSOES,
		escala: null,
		ausencias: [],
		feriados: new Map(),
		marcacoes,
		admissao: null,
		desligamento: null,
		...extra
	});
	return ap.dias.map((d) => detalharDia(d, ap.horarios, hoje));
}
const doDia = (dias: ReturnType<typeof detalhar>, d: string) => dias.find((x) => x.dia === d)!;

/**
 * Semana típica: seg pontual, ter 20 min atrasada na entrada, qua com batida
 * incluída pelo admin, qui falta, sex esqueceu a última batida.
 */
const SEMANA = [
	...batidas('2026-01-05', PADRAO),
	...batidas('2026-01-06', ['08:20', '12:00', '13:00', '17:00']),
	...batidas('2026-01-07', ['08:00', '12:00', '13:00']),
	...batidas('2026-01-07', ['17:00'], { fonte: 'I' }),
	...batidas('2026-01-09', ['08:00', '12:00', '13:00'])
];

describe('desviosDoDia', () => {
	const previstas = PADRAO.map((h) => brt(`2026-01-05T${h}`));
	const em = (horas: string[]) => horas.map((h) => brt(`2026-01-05T${h}`));

	it('batida única perto da saída: não é atraso na entrada', () => {
		const d = desviosDoDia(em(['17:04']), previstas);
		expect(d.entradaMin).toBeNull();
		expect(d.atrasoEntrada).toBe(false);
		// Perto da entrada continua sendo a entrada.
		expect(desviosDoDia(em(['08:30']), previstas).atrasoEntrada).toBe(true);
	});

	it('três batidas sem a entrada (12:23, 13:53, 17:56): nem entrada nem volta atrasadas', () => {
		const d = desviosDoDia(em(['12:23', '13:53', '17:56']), previstas);
		expect(d).toMatchObject({ entradaMin: null, voltaMin: null, atrasoEntrada: false });
		expect(d.voltaAtrasada).toBe(false);
		// Esqueceu a saída: a entrada atrasada continua sendo atraso.
		expect(desviosDoDia(em(['09:30', '12:00', '13:00']), previstas).atrasoEntrada).toBe(true);
	});

	it('dia pontual: tudo zero, nenhum alerta', () => {
		expect(desviosDoDia(em(PADRAO), previstas)).toEqual({
			entradaMin: 0,
			voltaMin: 0,
			saidaMin: 0,
			intervaloMin: 60,
			intervaloPrevistoMin: 60,
			atrasoEntrada: false,
			voltaAtrasada: false,
			intervaloCurto: false
		});
	});

	it('atraso na entrada só passa de ATRASO_MIN (5 min)', () => {
		expect(desviosDoDia(em(['08:05', '12:00', '13:00', '17:00']), previstas).atrasoEntrada).toBe(
			false
		);
		expect(desviosDoDia(em(['08:20', '12:00', '13:00', '17:00']), previstas)).toMatchObject({
			entradaMin: 20,
			atrasoEntrada: true
		});
	});

	it('volta do intervalo atrasada e intervalo curto (art. 71)', () => {
		expect(desviosDoDia(em(['08:00', '12:00', '13:30', '17:00']), previstas)).toMatchObject({
			voltaMin: 30,
			voltaAtrasada: true,
			intervaloMin: 90,
			intervaloCurto: false
		});
		expect(desviosDoDia(em(['08:00', '12:00', '12:40', '17:00']), previstas)).toMatchObject({
			intervaloMin: 40,
			intervaloCurto: true,
			voltaAtrasada: false
		});
	});

	it('a volta atrasada é o intervalo excedido, não o horário da volta', () => {
		// Saiu 1h depois para o intervalo e voltou 1h depois: intervalo igual ao previsto.
		expect(desviosDoDia(em(['08:00', '13:00', '14:00', '17:00']), previstas)).toMatchObject({
			voltaMin: 0,
			voltaAtrasada: false,
			intervaloMin: 60
		});
	});

	it('com 3 marcações já mede a volta; a saída só com o par fechado', () => {
		expect(desviosDoDia(em(['08:00', '12:00', '13:20']), previstas)).toMatchObject({
			voltaMin: 20,
			voltaAtrasada: true,
			saidaMin: null
		});
	});

	it('com mais de 4 marcações a 3ª não é a volta: sem volta nem intervalo', () => {
		const d = desviosDoDia(em(['08:00', '10:00', '10:30', '12:00', '13:00', '17:40']), previstas);
		expect(d).toMatchObject({ voltaMin: null, intervaloMin: null, saidaMin: 40 });
	});

	it('sem horário previsto ou sem marcação: nada a medir', () => {
		expect(desviosDoDia(em(PADRAO), null).entradaMin).toBeNull();
		expect(desviosDoDia([], previstas).entradaMin).toBeNull();
	});
});

describe('detalharDia', () => {
	const dias = detalhar(SEMANA);

	it('horas em Brasília, desvios e total do dia confiável', () => {
		expect(doDia(dias, '2026-01-06')).toMatchObject({
			situacao: 'normal',
			previstas: PADRAO,
			marcacoes: [
				{ hora: '08:20', incluida: false },
				{ hora: '12:00', incluida: false },
				{ hora: '13:00', incluida: false },
				{ hora: '17:00', incluida: false }
			],
			ajuste: false,
			totalMin: 460
		});
	});

	it('inclusão do admin: marcada, e o total do dia sai da conta', () => {
		const qua = doDia(dias, '2026-01-07');
		expect(qua.marcacoes.at(-1)).toEqual({ hora: '17:00', incluida: true });
		expect(qua).toMatchObject({ ajuste: true, totalMin: null });
	});

	it('desconsiderada some das marcações e conta como ajuste', () => {
		const d = detalhar([
			...batidas('2026-01-05', ['08:00'], { anulada: true }),
			...batidas('2026-01-05', PADRAO)
		]);
		expect(doDia(d, '2026-01-05')).toMatchObject({ ajuste: true, totalMin: null });
		expect(doDia(d, '2026-01-05').marcacoes).toHaveLength(4);
	});

	it('falta, batida faltando e dia sem expediente', () => {
		expect(doDia(dias, '2026-01-08').situacao).toBe('falta');
		expect(doDia(dias, '2026-01-09')).toMatchObject({ situacao: 'aberto', totalMin: null });
		expect(doDia(dias, '2026-01-10').situacao).toBe('sem_expediente');
	});

	it('dia corrente fica em andamento até fechar as marcações previstas', () => {
		const d = detalhar(
			batidas('2026-01-09', ['08:00', '12:00']),
			{},
			'2026-01-09',
			brt('2026-01-09T12:30')
		);
		expect(doDia(d, '2026-01-09')).toMatchObject({ situacao: 'em_andamento', totalMin: null });
	});
});

describe('dia de referência e chip', () => {
	it('domingo sem expediente: o último dia com expediente', () => {
		const ref = diaDeReferencia(detalhar(SEMANA), HOJE);
		expect(ref).toMatchObject({ rotulo: 'ultimo', dia: { dia: '2026-01-09' } });
	});

	it('dia útil é "hoje", mesmo antes da primeira batida', () => {
		const d = detalhar([], {}, '2026-01-09', brt('2026-01-09T07:30'));
		expect(diaDeReferencia(d, '2026-01-09')).toMatchObject({ rotulo: 'hoje' });
	});

	it('férias não são dia de referência', () => {
		const d = detalhar(SEMANA, {
			ausencias: [
				{ tipo: 'ferias', dataInicio: dataPura('2026-01-08'), dataFim: dataPura('2026-01-11') }
			]
		});
		expect(diaDeReferencia(d, HOJE)!.dia.dia).toBe('2026-01-07');
	});

	it('chip do dia: atraso, batida faltando, falta', () => {
		const dias = detalhar(SEMANA);
		const agora = brt(`${HOJE}T09:00`);
		expect(chipDoDia(doDia(dias, '2026-01-06'), agora)).toEqual({
			texto: 'Atraso de 20 min na entrada',
			tom: 'aviso'
		});
		expect(chipDoDia(doDia(dias, '2026-01-05'), agora)).toEqual({ texto: 'No horário', tom: 'ok' });
		expect(chipDoDia(doDia(dias, '2026-01-09'), agora).texto).toBe('Batida faltando');
		expect(chipDoDia(doDia(dias, '2026-01-08'), agora)).toEqual({ texto: 'Falta', tom: 'alerta' });
	});

	it('chip do dia corrente sem batida segue o painel: só vira falta provável depois de 1 h', () => {
		const em = (hora: string) => {
			const agora = brt(`2026-01-09T${hora}`);
			const d = doDia(detalhar([], {}, '2026-01-09', agora), '2026-01-09');
			return chipDoDia(d, agora);
		};
		expect(em('07:58')).toEqual({ texto: 'Entrada prevista às 08:00', tom: 'neutro' });
		expect(em('08:30')).toEqual({ texto: 'Sem entrada até agora · previsto 08:00', tom: 'aviso' });
		expect(em('09:30').tom).toBe('alerta');
	});
});

describe('montarSemana', () => {
	it('da segunda ao dia de referência, sem domingo e sábado vazios', () => {
		const s = montarSemana(detalhar(SEMANA), '2026-01-09');
		expect(s.dias.map((d) => d.dia)).toEqual([
			'2026-01-05',
			'2026-01-06',
			'2026-01-07',
			'2026-01-08',
			'2026-01-09'
		]);
		// Total: seg 8h + ter 7h40; previsto inclui a falta de quinta.
		expect(s).toMatchObject({
			realizadoMin: 940,
			previstoMin: 1440,
			diasForaDaConta: 2,
			atrasosEntrada: 1,
			voltasAtrasadas: 0,
			faltas: 1
		});
	});
});

describe('montarCards', () => {
	const cards = montarCards(detalhar(SEMANA));

	it('presença: dias previstos, faltas e o que ficou de fora', () => {
		expect(cards.presenca).toMatchObject({
			diasComMarcacao: 4,
			diasPrevistos: 5,
			faltas: 1,
			percentual: 80,
			ferias: 0,
			folgas: 2
		});
	});

	it('pontualidade e onde atrasa não avaliam dia com ajuste', () => {
		// Avaliados: seg, ter e sex (qua tem inclusão; qui é falta).
		expect(cards.pontualidade).toEqual({ diasAvaliados: 3, diasSemAtraso: 2, percentual: 66.7 });
		expect(cards.ondeAtrasa).toEqual({
			onde: 'entrada',
			entradas: 1,
			voltas: 0,
			tipicoEntradaMin: 20,
			tipicoVoltaMin: null
		});
	});

	it('saldo: só dias limpos, a falta entra como déficit', () => {
		expect(cards.saldo).toEqual({
			realizadoMin: 940,
			previstoMin: 1440,
			saldoMin: -500,
			diasComAjuste: 1,
			diasComBatidaFaltando: 1
		});
	});

	it('férias saem dos previstos e entram nas exclusões', () => {
		const c = montarCards(
			detalhar(batidas('2026-01-05', PADRAO), {
				ausencias: [
					{ tipo: 'ferias', dataInicio: dataPura('2026-01-06'), dataFim: dataPura('2026-01-09') }
				]
			})
		);
		expect(c.presenca).toMatchObject({ diasPrevistos: 1, faltas: 0, ferias: 4 });
	});

	it('atraso só na volta, e nos dois lugares', () => {
		const volta = montarCards(
			detalhar([
				...batidas('2026-01-05', ['08:00', '12:00', '13:40', '17:00']),
				...batidas('2026-01-06', ['08:00', '12:00', '13:20', '17:00'])
			])
		);
		expect(volta.ondeAtrasa).toMatchObject({ onde: 'volta', voltas: 2, tipicoVoltaMin: 30 });

		const ambos = montarCards(
			detalhar([
				...batidas('2026-01-05', ['08:30', '12:00', '13:00', '17:00']),
				...batidas('2026-01-06', ['08:00', '12:00', '13:30', '17:00'])
			])
		);
		expect(ambos.ondeAtrasa.onde).toBe('ambos');
	});
});

describe('leituraDoDia', () => {
	// Três dias chegando 30 min tarde e saindo 30 min depois: compensa na saída.
	const compensa = [
		...batidas('2026-01-05', ['08:30', '12:00', '13:00', '17:30']),
		...batidas('2026-01-06', ['08:30', '12:00', '13:00', '17:30']),
		...batidas('2026-01-07', ['08:30', '12:00', '13:00', '17:30'])
	];

	it('diz onde foi o atraso e se costuma compensar, sem pronome', () => {
		const dias = detalhar(compensa);
		const cards = montarCards(dias);
		const texto = leituraDoDia(doDia(dias, '2026-01-07'), cards);
		expect(texto).toBe(
			'O atraso foi na entrada, como em todos os 3 dias com atraso do período. ' +
				'Costuma sair mais tarde para compensar: vale confirmar se esse horário foi combinado.'
		);
		expect(texto).not.toMatch(/\b(ela|ele)\b/i);
	});

	it('sem compensação, só o onde', () => {
		const dias = detalhar(SEMANA);
		expect(leituraDoDia(doDia(dias, '2026-01-06'), montarCards(dias))).toBe(
			'O atraso foi na entrada; no período houve 1 dia com atraso.'
		);
	});

	it('dia sem desvio: nada a dizer; batida faltando aponta para Ajustes', () => {
		const dias = detalhar(SEMANA);
		const cards = montarCards(dias);
		expect(leituraDoDia(doDia(dias, '2026-01-05'), cards)).toBe('');
		expect(leituraDoDia(doDia(dias, '2026-01-09'), cards)).toMatch(/Ajustes/);
	});
});

describe('período', () => {
	const agora = brt('2026-10-17T10:00');

	it('termina ontem', () => {
		expect(intervaloDoPeriodo('30d', agora)).toEqual({ inicio: '2026-09-17', fim: '2026-10-16' });
	});

	it('só oferece períodos que cabem no tempo de casa', () => {
		expect(periodosDisponiveis(null, agora)).toEqual(['30d', '3m', '6m', '12m']);
		expect(periodosDisponiveis('2026-06-18', agora)).toEqual(['30d', '3m']);
		expect(periodosDisponiveis('2026-10-01', agora)).toEqual(['30d']);
	});

	it('inicioDaSemana é a segunda-feira', () => {
		expect(inicioDaSemana('2026-01-11')).toBe('2026-01-05');
		expect(inicioDaSemana('2026-01-05')).toBe('2026-01-05');
	});
});
