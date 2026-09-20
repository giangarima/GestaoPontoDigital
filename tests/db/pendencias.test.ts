/**
 * Dias em aberto: a varredura que encontra jornadas com marcação faltando.
 * O cálculo em si é do `apurarPeriodo` (coberto em espelho); aqui se verifica
 * o recorte — o que entra na lista, o que fica de fora e o escopo por empresa.
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/server/db';
import { pendenciasDoPeriodo } from '@/lib/server/pendencias';
import { baterPonto, criarColaborador, criarEmpresa, incluirPonto } from './fixtures';

const brt = (s: string) => new Date(`${s}:00-03:00`);

/** Jornada seg–sex 08:00–12:00 / 13:00–17:00 vinculada ao colaborador. */
async function vincularJornada(empresaId: string, colaboradorId: string) {
	const util = {
		ativo: true,
		entrada: '08:00',
		saida_almoco: '12:00',
		retorno_almoco: '13:00',
		saida: '17:00'
	};
	const folga = { ativo: false, entrada: '', saida_almoco: '', retorno_almoco: '', saida: '' };
	const jornada = await prisma.jornada.create({
		data: {
			empresaId,
			nome: 'Comercial',
			versoes: {
				create: {
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
			}
		}
	});
	await prisma.colaborador.update({
		where: { id: colaboradorId },
		data: { jornadaId: jornada.id }
	});
}

// 2026-03-02 e 03 são segunda e terça.
const DEPOIS = new Date('2026-04-01T12:00:00Z');

describe('pendenciasDoPeriodo', () => {
	it('lista o dia com marcação ímpar e ignora o dia completo', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id, 'Esquecido');
		await vincularJornada(empresa.id, colaborador.id);

		// Segunda: dia completo (4 marcações).
		for (const h of ['08:00', '12:00', '13:00', '17:00']) {
			await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
				marcadoEm: brt(`2026-03-02T${h}`)
			});
		}
		// Terça: esqueceu a saída (3 marcações).
		for (const h of ['08:00', '12:02', '13:01']) {
			await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
				marcadoEm: brt(`2026-03-03T${h}`)
			});
		}

		const r = await pendenciasDoPeriodo(empresa.id, '2026-03-01', '2026-03-31', DEPOIS);

		expect(r.total).toBe(1);
		expect(r.colaboradores).toHaveLength(1);
		expect(r.colaboradores[0].nome).toBe('Esquecido');
		expect(r.colaboradores[0].dias.map((d) => d.dia)).toEqual(['2026-03-03']);
		expect(r.colaboradores[0].dias[0].marcacoes.map((m) => m.hora)).toEqual([
			'08:00',
			'12:02',
			'13:01'
		]);
		// Só o par que fechou conta: 08:00–12:02.
		expect(r.colaboradores[0].dias[0].realizadoMin).toBe(242);
	});

	it('some da lista depois que o admin lança a marcação que faltava', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);

		for (const h of ['08:00', '12:00', '13:00']) {
			await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
				marcadoEm: brt(`2026-03-03T${h}`)
			});
		}
		const antes = await pendenciasDoPeriodo(empresa.id, '2026-03-01', '2026-03-31', DEPOIS);
		expect(antes.total).toBe(1);

		await incluirPonto(empresa.id, colaborador.id, usuario.cpf, brt('2026-03-03T17:00'));

		const depois = await pendenciasDoPeriodo(empresa.id, '2026-03-01', '2026-03-31', DEPOIS);
		expect(depois.total).toBe(0);
		expect(depois.colaboradores).toEqual([]);
	});

	it('não acusa o dia corrente, que ainda está em andamento', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);

		// Uma única batida no dia que está sendo apurado.
		await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
			marcadoEm: brt('2026-03-03T08:00')
		});

		const r = await pendenciasDoPeriodo(
			empresa.id,
			'2026-03-01',
			'2026-03-31',
			brt('2026-03-03T10:00')
		);
		expect(r.total).toBe(0);
	});

	it('marca a fonte das marcações, distinguindo inclusão de batida do REP', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);

		await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
			marcadoEm: brt('2026-03-03T08:00')
		});
		await incluirPonto(empresa.id, colaborador.id, usuario.cpf, brt('2026-03-03T12:00'));
		await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
			marcadoEm: brt('2026-03-03T13:00')
		});

		const r = await pendenciasDoPeriodo(empresa.id, '2026-03-01', '2026-03-31', DEPOIS);
		expect(r.colaboradores[0].dias[0].marcacoes).toEqual([
			{ hora: '08:00', fonte: 'O' },
			{ hora: '12:00', fonte: 'I' },
			{ hora: '13:00', fonte: 'O' }
		]);
	});

	it('não enxerga pendência de outra empresa', async () => {
		const a = await criarEmpresa();
		const b = await criarEmpresa();
		const colabB = await criarColaborador(b.id);
		await vincularJornada(b.id, colabB.colaborador.id);
		await baterPonto(b.id, colabB.colaborador.id, colabB.usuario.cpf, {
			marcadoEm: brt('2026-03-03T08:00')
		});

		const r = await pendenciasDoPeriodo(a.id, '2026-03-01', '2026-03-31', DEPOIS);
		expect(r.total).toBe(0);
	});

	it('ordena pelos colaboradores com mais dias em aberto', async () => {
		const empresa = await criarEmpresa();
		const um = await criarColaborador(empresa.id, 'Zeca');
		const dois = await criarColaborador(empresa.id, 'Ana');
		await vincularJornada(empresa.id, um.colaborador.id);
		await vincularJornada(empresa.id, dois.colaborador.id);

		// Zeca: 1 dia em aberto. Ana: 2.
		await baterPonto(empresa.id, um.colaborador.id, um.usuario.cpf, {
			marcadoEm: brt('2026-03-03T08:00')
		});
		for (const dia of ['2026-03-03', '2026-03-04']) {
			await baterPonto(empresa.id, dois.colaborador.id, dois.usuario.cpf, {
				marcadoEm: brt(`${dia}T08:00`)
			});
		}

		const r = await pendenciasDoPeriodo(empresa.id, '2026-03-01', '2026-03-31', DEPOIS);
		expect(r.colaboradores.map((c) => c.nome)).toEqual(['Ana', 'Zeca']);
		expect(r.total).toBe(3);
	});

	it('lista os dias do mais recente para o mais antigo', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);

		for (const dia of ['2026-03-03', '2026-03-05', '2026-03-04']) {
			await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
				marcadoEm: brt(`${dia}T08:00`)
			});
		}

		const r = await pendenciasDoPeriodo(empresa.id, '2026-03-01', '2026-03-31', DEPOIS);
		expect(r.colaboradores[0].dias.map((d) => d.dia)).toEqual([
			'2026-03-05',
			'2026-03-04',
			'2026-03-03'
		]);
	});
});
