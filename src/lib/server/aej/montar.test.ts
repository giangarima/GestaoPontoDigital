/**
 * AEJ conferido contra o leiaute oficial (Anexo da Portaria 671/2021): campos
 * separados por "|", sem CRC, registros 01–08/99 e literal de assinatura.
 */
import { describe, expect, it } from 'vitest';
import { montarLinhasAej, type AejEntrada, type MarcacaoAej } from './montar';

const dia = (ativo: boolean, e = '', sa = '', ra = '', s = '') => ({
	ativo,
	entrada: e,
	saida_almoco: sa,
	retorno_almoco: ra,
	saida: s
});
const semana = (util: ReturnType<typeof dia>) => ({
	segunda: util,
	terca: util,
	quarta: util,
	quinta: util,
	sexta: util,
	sabado: dia(false),
	domingo: dia(false)
});
const COMERCIAL = [
	{
		vigenciaInicio: new Date('2020-01-01T00:00:00Z'),
		dias: semana(dia(true, '08:00', '12:00', '13:00', '17:00'))
	}
];
const MEIO_PERIODO = [
	{
		vigenciaInicio: new Date('2020-01-01T00:00:00Z'),
		dias: semana(dia(true, '08:00', '10:00', '10:15', '12:00'))
	}
];

/** Horário de Brasília → Date. */
const brt = (s: string) => new Date(`${s}:00-03:00`);
const original = (s: string): MarcacaoAej => ({
	marcadoEm: brt(s),
	registradoEm: brt(s),
	fonte: 'O',
	criadoMotivo: null,
	anulacao: null
});

function entrada(): AejEntrada {
	return {
		empresa: {
			cnpj: '00.000.000/0001-00',
			caepfCno: null,
			razaoSocial: 'Empresa Demo Serviços LTDA'
		},
		// Domingo 04/01 a quinta 08/01/2026, gerado na sexta 09/01.
		inicio: brt('2026-01-04T00:00'),
		fim: new Date('2026-01-08T23:59:59.999-03:00'),
		agora: brt('2026-01-09T12:00'),
		vinculos: [
			{
				cpf: '11144477735',
				nome: 'Carlos Souza',
				admissao: new Date('2025-01-01T00:00:00Z'),
				desligamento: null,
				versoes: COMERCIAL,
				diasAbonados: new Set(['2026-01-07']), // atestado na quarta
				marcacoes: [
					// segunda: dia normal
					original('2026-01-05T08:02'),
					original('2026-01-05T12:01'),
					original('2026-01-05T13:00'),
					original('2026-01-05T17:05'),
					// terça: ajuste da entrada (original desconsiderada + inclusão)
					{
						...original('2026-01-06T08:40'),
						anulacao: { motivo: 'Relógio adiantado' }
					},
					{
						marcadoEm: brt('2026-01-06T08:00'),
						registradoEm: brt('2026-01-09T10:00'),
						fonte: 'I',
						criadoMotivo: 'Relógio adiantado',
						anulacao: null
					},
					original('2026-01-06T12:00'),
					original('2026-01-06T13:00'),
					original('2026-01-06T17:00')
					// quarta: atestado (sem falta) | quinta: sem marcação → falta
				]
			},
			{
				cpf: '22255588846',
				nome: 'Ana Pereira',
				admissao: new Date('2025-01-01T00:00:00Z'),
				desligamento: brt('2026-01-06T18:00'), // desligada na terça
				versoes: MEIO_PERIODO,
				diasAbonados: new Set(),
				marcacoes: [original('2026-01-05T08:00')]
			}
		]
	};
}

describe('montarLinhasAej', () => {
	it('gera o arquivo esperado, registro a registro', () => {
		expect(montarLinhasAej(entrada())).toEqual([
			'01|1|00000000000100|||Empresa Demo Serviços LTDA|2026-01-04|2026-01-08|2026-01-09T12:00:00-0300|002',
			'02|1|3|00000000000000000',
			'03|1|11144477735|Carlos Souza',
			'03|2|22255588846|Ana Pereira',
			'04|H1|480|0800|1200|1300|1700',
			'04|H2|225|0800|1000|1015|1200',
			// Carlos, segunda: pares 1 e 2, originais do REP 1; H1 na primeira entrada
			'05|1|2026-01-05T08:02:00-0300|1|E|1|O|H1|',
			'05|1|2026-01-05T12:01:00-0300|1|S|1|O||',
			'05|1|2026-01-05T13:00:00-0300|1|E|2|O||',
			'05|1|2026-01-05T17:05:00-0300|1|S|2|O||',
			// Carlos, terça: inclusão (sem REP, com motivo) + original desconsiderada
			'05|1|2026-01-06T08:00:00-0300||E|1|I|H1|Relógio adiantado',
			'05|1|2026-01-06T08:40:00-0300|1|D|1|O||Relógio adiantado',
			'05|1|2026-01-06T12:00:00-0300|1|S|1|O||',
			'05|1|2026-01-06T13:00:00-0300|1|E|2|O||',
			'05|1|2026-01-06T17:00:00-0300|1|S|2|O||',
			// Ana, segunda
			'05|2|2026-01-05T08:00:00-0300|1|E|1|O|H2|',
			// Carlos: DSR no domingo e falta na quinta (quarta tem atestado)
			'07|1|1|2026-01-04||',
			'07|1|2|2026-01-08||',
			// Ana: DSR e falta na terça; depois do desligamento não conta
			'07|2|1|2026-01-04||',
			'07|2|2|2026-01-06||',
			'08|OnTime - Controle de Jornada Digital|0.1.0|1|00000000000000|OnTime Sistemas|contato@ontime.dev',
			'99|1|1|2|2|10|0|4|1',
			'ASSINATURA_DIGITAL_EM_ARQUIVO_P7S'.padEnd(100, ' ')
		]);
	});

	it('cada registro tem o número de campos do leiaute e nenhuma linha vazia', () => {
		const CAMPOS: Record<string, number> = {
			'01': 10,
			'02': 4,
			'03': 4,
			'04': 7,
			'05': 9,
			'07': 6,
			'08': 7,
			'99': 9
		};
		const linhas = montarLinhasAej(entrada());
		for (const linha of linhas.slice(0, -1)) {
			expect(linha, linha).not.toBe('');
			expect(linha.split('|'), linha).toHaveLength(CAMPOS[linha.slice(0, 2)]);
		}
	});

	it('motivo da inclusão é obrigatório; "|" e quebras de linha não quebram o arquivo', () => {
		const e = entrada();
		e.vinculos[0].marcacoes[5] = {
			...e.vinculos[0].marcacoes[5],
			criadoMotivo: 'Esqueceu | bateu\r\ndepois'
		};
		const inclusao = montarLinhasAej(e).find((l) => l.includes('|I|'))!;
		expect(inclusao.split('|')).toHaveLength(9);
		expect(inclusao.endsWith('|Esqueceu bateu depois')).toBe(true);
	});

	it('não aponta falta no dia de hoje nem em dia futuro', () => {
		const e = entrada();
		e.agora = brt('2026-01-08T09:00'); // quinta ainda em andamento
		const faltas = montarLinhasAej(e).filter((l) => l.startsWith('07|1|2|'));
		expect(faltas).toEqual([]);
	});

	it('CNO/CAEPF vão no campo certo pelo tamanho', () => {
		const e = entrada();
		e.empresa.caepfCno = '123456789012'; // CNO tem 12 dígitos
		expect(montarLinhasAej(e)[0]).toContain('|00000000000100||123456789012|');
	});
});
