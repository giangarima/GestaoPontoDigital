/**
 * Dias em aberto: a varredura que encontra jornadas com marcação faltando.
 * O cálculo em si é do `apurarPeriodo` (coberto em espelho); aqui se verifica
 * o recorte — o que entra na lista, o que fica de fora e o escopo por empresa.
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/server/db';
import { contarDiasEmAberto, pendenciasDoPeriodo } from '@/lib/server/pendencias';
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

/**
 * `contarDiasEmAberto` é uma agregação SQL que existe só para não trazer o mês
 * inteiro a cada atualização automática do dashboard. Ela reimplementa a regra
 * de `pendenciasDoPeriodo` em outra linguagem, então precisa de uma trava: se as
 * duas divergirem, o badge do menu passa a mentir sobre a tela de pendências.
 */
describe('contarDiasEmAberto ≡ pendenciasDoPeriodo().total', () => {
	it('bate com a lista num cenário com todos os casos de borda juntos', async () => {
		const empresa = await criarEmpresa();
		const outra = await criarEmpresa();

		// 1. Dias em aberto normais (ímpar, encerrados) — devem contar.
		const a = await criarColaborador(empresa.id, 'Aberto');
		await vincularJornada(empresa.id, a.colaborador.id);
		for (const dia of ['2026-03-03', '2026-03-04']) {
			await baterPonto(empresa.id, a.colaborador.id, a.usuario.cpf, {
				marcadoEm: brt(`${dia}T08:00`)
			});
		}

		// 2. Dia par (fechado) não conta; dia ímpar em sábado (folga) conta.
		const b = await criarColaborador(empresa.id, 'Borda');
		await vincularJornada(empresa.id, b.colaborador.id);
		for (const h of ['08:00', '12:00']) {
			await baterPonto(empresa.id, b.colaborador.id, b.usuario.cpf, {
				marcadoEm: brt(`2026-03-05T${h}`)
			});
		}
		// 2026-03-07 é sábado, sem expediente na jornada.
		await baterPonto(empresa.id, b.colaborador.id, b.usuario.cpf, {
			marcadoEm: brt('2026-03-07T09:00')
		});

		// 3. Dia ímpar coberto por ausência aprovada — não conta.
		const c = await criarColaborador(empresa.id, 'Abonado');
		await vincularJornada(empresa.id, c.colaborador.id);
		await baterPonto(empresa.id, c.colaborador.id, c.usuario.cpf, {
			marcadoEm: brt('2026-03-10T08:00')
		});
		await prisma.ausencia.create({
			data: {
				colaboradorId: c.colaborador.id,
				empresaId: empresa.id,
				tipo: 'atestado',
				dataInicio: new Date('2026-03-10T00:00:00Z'),
				dataFim: new Date('2026-03-10T00:00:00Z'),
				status: 'aprovada'
			}
		});

		// 4. Dia ímpar antes da admissão — não conta.
		const d = await criarColaborador(empresa.id, 'Novato');
		await vincularJornada(empresa.id, d.colaborador.id);
		await prisma.colaborador.update({
			where: { id: d.colaborador.id },
			data: { dataAdmissao: new Date('2026-03-15T00:00:00Z') }
		});
		await baterPonto(empresa.id, d.colaborador.id, d.usuario.cpf, {
			marcadoEm: brt('2026-03-11T08:00')
		});
		await baterPonto(empresa.id, d.colaborador.id, d.usuario.cpf, {
			marcadoEm: brt('2026-03-16T08:00')
		});

		// 5. Marcação anulada não conta como marcação: o dia fica par.
		const e = await criarColaborador(empresa.id, 'Anulado');
		await vincularJornada(empresa.id, e.colaborador.id);
		for (const h of ['08:00', '12:00']) {
			await baterPonto(empresa.id, e.colaborador.id, e.usuario.cpf, {
				marcadoEm: brt(`2026-03-12T${h}`)
			});
		}
		const extra = await baterPonto(empresa.id, e.colaborador.id, e.usuario.cpf, {
			marcadoEm: brt('2026-03-12T12:00')
		});
		// `anuladoPor` é FK para Usuario: a anulação precisa de um autor.
		const admin = await prisma.usuario.create({
			data: {
				empresaId: empresa.id,
				nome: 'Admin',
				email: 'admin-anulacao@teste.com',
				cpf: '00011122233',
				senhaHash: 'x',
				role: 'admin'
			}
		});
		await prisma.registroAnulacao.create({
			data: {
				registroId: extra.id,
				empresaId: empresa.id,
				motivo: 'Marcação no mesmo minuto',
				anuladoPor: admin.id
			}
		});

		// 6. Outra empresa com dia em aberto — não pode vazar.
		const f = await criarColaborador(outra.id, 'DeOutra');
		await vincularJornada(outra.id, f.colaborador.id);
		await baterPonto(outra.id, f.colaborador.id, f.usuario.cpf, {
			marcadoEm: brt('2026-03-03T08:00')
		});

		const lista = await pendenciasDoPeriodo(empresa.id, '2026-03-01', '2026-03-31', DEPOIS);
		const contagem = await contarDiasEmAberto(empresa.id, '2026-03-01', '2026-03-31', DEPOIS);

		expect(contagem).toBe(lista.total);
		expect(contagem).toBeGreaterThan(0);
	});

	it('ignora o dia corrente, como a lista', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);
		await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
			marcadoEm: brt('2026-03-03T08:00')
		});

		const agora = brt('2026-03-03T10:00');
		const lista = await pendenciasDoPeriodo(empresa.id, '2026-03-01', '2026-03-31', agora);
		const contagem = await contarDiasEmAberto(empresa.id, '2026-03-01', '2026-03-31', agora);

		expect(lista.total).toBe(0);
		expect(contagem).toBe(0);
	});

	it('não conta colaborador desligado, como a lista', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);
		await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
			marcadoEm: brt('2026-03-03T08:00')
		});
		await prisma.colaborador.update({
			where: { id: colaborador.id },
			data: { deletedAt: new Date('2026-03-20T00:00:00Z') }
		});

		const lista = await pendenciasDoPeriodo(empresa.id, '2026-03-01', '2026-03-31', DEPOIS);
		const contagem = await contarDiasEmAberto(empresa.id, '2026-03-01', '2026-03-31', DEPOIS);

		expect(lista.total).toBe(0);
		expect(contagem).toBe(0);
	});
});
