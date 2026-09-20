/**
 * Painel do dia carregado do banco. A árvore de decisão em si está coberta por
 * `src/lib/server/painel/montar.test.ts` (puro); aqui se verifica o que só o
 * banco mostra: o recorte das consultas, o vínculo, a anulação, o fuso e o
 * escopo por empresa.
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/server/db';
import { carregarPainelDia, carregarResumoAdmin } from '@/lib/server/painel/carregar';
import { baterPonto, criarColaborador, criarEmpresa, incluirPonto } from './fixtures';

const brt = (s: string) => new Date(`${s}:00-03:00`);

const util = {
	ativo: true,
	entrada: '08:00',
	saida_almoco: '12:00',
	retorno_almoco: '13:00',
	saida: '17:00'
};
const folga = { ativo: false, entrada: '', saida_almoco: '', retorno_almoco: '', saida: '' };

/** Jornada seg–sex 08:00–17:00 com almoço; sábado e domingo de folga. */
async function vincularJornada(empresaId: string, colaboradorId: string) {
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

// 2026-03-03 terça, 2026-03-07 sábado, 2026-03-08 domingo.
const TERCA = '2026-03-03';
const DOMINGO = '2026-03-08';
const DEPOIS = brt('2026-03-20T09:00');

describe('carregarPainelDia', () => {
	it('monta a linha com departamento, turno e previsto', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id, 'Ana Souza');
		await vincularJornada(empresa.id, colaborador.id);
		const depto = await prisma.departamento.create({
			data: { empresaId: empresa.id, nome: 'Loja' }
		});
		await prisma.colaborador.update({
			where: { id: colaborador.id },
			data: { departamentoId: depto.id }
		});
		for (const h of ['08:00', '12:00', '13:00', '17:00']) {
			await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
				marcadoEm: brt(`${TERCA}T${h}`)
			});
		}

		const p = await carregarPainelDia(empresa.id, TERCA, DEPOIS);

		expect(p.linhas).toHaveLength(1);
		const l = p.linhas[0];
		expect(l.nome).toBe('Ana Souza');
		expect(l.departamento).toBe('Loja');
		expect(l.previstaEntrada).toBe('08:00');
		expect(l.previstaSaida).toBe('17:00');
		expect(l.entradaHora).toBe('08:00');
		expect(l.ultimaHora).toBe('17:00');
		expect(l.marcacoes).toBe(4);
		expect(l.situacao).toBe('cumpriu');
		expect(p.semEscala).toBe(false);
		expect(p.navegacao).toBeNull();
	});

	it('colaborador sem departamento vem como null', async () => {
		const empresa = await criarEmpresa();
		const { colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);

		const p = await carregarPainelDia(empresa.id, TERCA, DEPOIS);
		expect(p.linhas[0].departamento).toBeNull();
	});

	it('marcação anulada não conta — o dia par vira ímpar', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);
		for (const h of ['08:00', '12:00', '13:00']) {
			await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
				marcadoEm: brt(`${TERCA}T${h}`)
			});
		}
		const extra = await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
			marcadoEm: brt(`${TERCA}T17:00`)
		});
		const admin = await prisma.usuario.create({
			data: {
				empresaId: empresa.id,
				nome: 'Admin',
				email: 'admin-painel@teste.com',
				cpf: '00011122233',
				senhaHash: 'x',
				role: 'admin'
			}
		});
		await prisma.registroAnulacao.create({
			data: {
				registroId: extra.id,
				empresaId: empresa.id,
				motivo: 'REGISTRO DUPLICADO',
				anuladoPor: admin.id
			}
		});

		const p = await carregarPainelDia(empresa.id, TERCA, DEPOIS);
		expect(p.linhas[0].marcacoes).toBe(3);
		expect(p.linhas[0].diaEmAberto).toBe(true);
		expect(p.resumo.diasEmAberto).toBe(1);
	});

	it('inclusão do admin conta como marcação e fecha o par', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);
		for (const h of ['08:00', '12:00', '13:00']) {
			await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
				marcadoEm: brt(`${TERCA}T${h}`)
			});
		}
		await incluirPonto(empresa.id, colaborador.id, usuario.cpf, brt(`${TERCA}T17:00`));

		const p = await carregarPainelDia(empresa.id, TERCA, DEPOIS);
		expect(p.linhas[0].marcacoes).toBe(4);
		expect(p.linhas[0].diaEmAberto).toBe(false);
	});

	// O endpoint antigo filtrava `tipo: 'entrada'`; a apuração pareia por ordem.
	it('não filtra por tipo: qualquer marcação do dia entra na conta', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);
		await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
			tipo: 'saida',
			marcadoEm: brt(`${TERCA}T08:00`)
		});

		const p = await carregarPainelDia(empresa.id, TERCA, DEPOIS);
		expect(p.linhas[0].marcacoes).toBe(1);
		expect(p.linhas[0].entradaHora).toBe('08:00');
	});

	it('batida às 22:30 fica no dia de Brasília, não no dia UTC seguinte', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);
		await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
			marcadoEm: brt(`${TERCA}T22:30`)
		});

		const p = await carregarPainelDia(empresa.id, TERCA, DEPOIS);
		expect(p.linhas[0].marcacoes).toBe(1);
		expect(p.linhas[0].entradaHora).toBe('22:30');
	});
});

describe('carregarPainelDia — vínculo', () => {
	it('quem foi admitido depois do dia não aparece', async () => {
		const empresa = await criarEmpresa();
		const { colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);
		await prisma.colaborador.update({
			where: { id: colaborador.id },
			data: { dataAdmissao: new Date('2026-03-10T00:00:00Z') }
		});

		const p = await carregarPainelDia(empresa.id, TERCA, DEPOIS);
		expect(p.linhas).toHaveLength(0);
	});

	it('quem foi desligado antes do dia não aparece', async () => {
		const empresa = await criarEmpresa();
		const { colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);
		await prisma.colaborador.update({
			where: { id: colaborador.id },
			data: { deletedAt: new Date('2026-03-01T00:00:00Z') }
		});

		const p = await carregarPainelDia(empresa.id, TERCA, DEPOIS);
		expect(p.linhas).toHaveLength(0);
	});

	// Consultar um dia do passado precisa mostrar quem trabalhava ali.
	it('quem foi desligado depois do dia ainda aparece naquele dia', async () => {
		const empresa = await criarEmpresa();
		const { colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);
		await prisma.colaborador.update({
			where: { id: colaborador.id },
			data: { deletedAt: new Date('2026-03-15T00:00:00Z') }
		});

		const p = await carregarPainelDia(empresa.id, TERCA, DEPOIS);
		expect(p.linhas).toHaveLength(1);
	});

	// fixtures.ts cria colaborador sem `status`: filtrar por === 'ativo' sumiria com ele.
	it('colaborador com status nulo conta como ativo', async () => {
		const empresa = await criarEmpresa();
		const { colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);
		expect(
			(await prisma.colaborador.findUnique({ where: { id: colaborador.id } }))?.status
		).toBeNull();

		const p = await carregarPainelDia(empresa.id, TERCA, DEPOIS);
		expect(p.linhas).toHaveLength(1);
	});
});

describe('carregarPainelDia — ausência', () => {
	async function comAusencia(tipo: string, status: string) {
		const empresa = await criarEmpresa();
		const { colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);
		await prisma.ausencia.create({
			data: {
				colaboradorId: colaborador.id,
				empresaId: empresa.id,
				tipo,
				dataInicio: new Date(`${TERCA}T00:00:00Z`),
				dataFim: new Date(`${TERCA}T00:00:00Z`),
				status
			}
		});
		return carregarPainelDia(empresa.id, TERCA, DEPOIS);
	}

	it('ausência aprovada afasta a falta', async () => {
		const p = await comAusencia('atestado', 'aprovada');
		expect(p.linhas[0].situacao).toBe('ausencia');
		expect(p.linhas[0].ausencia?.rotulo).toBe('Atestado');
	});

	it('férias têm situação própria', async () => {
		const p = await comAusencia('ferias', 'aprovada');
		expect(p.linhas[0].situacao).toBe('ferias');
	});

	it('ausência pendente NÃO abona: o dia continua sendo falta', async () => {
		const p = await comAusencia('atestado', 'pendente');
		expect(p.linhas[0].situacao).toBe('falta_provavel');
		expect(p.linhas[0].ausencia).toBeNull();
	});
});

describe('carregarPainelDia — dia sem escala', () => {
	it('domingo vira semEscala e aponta os dias vizinhos com expediente', async () => {
		const empresa = await criarEmpresa();
		const { colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);

		const p = await carregarPainelDia(empresa.id, DOMINGO, DEPOIS);

		expect(p.semEscala).toBe(true);
		expect(p.linhas[0].situacao).toBe('folga');
		// Sábado também é folga nesta jornada: o vizinho anterior é a sexta.
		expect(p.navegacao?.anterior).toBe('2026-03-06');
		expect(p.navegacao?.proximo).toBe('2026-03-09');
	});
});

describe('carregarPainelDia — escopo e resumo', () => {
	it('não enxerga colaborador nem marcação de outra empresa', async () => {
		const a = await criarEmpresa();
		const b = await criarEmpresa();
		const daB = await criarColaborador(b.id);
		await vincularJornada(b.id, daB.colaborador.id);
		await baterPonto(b.id, daB.colaborador.id, daB.usuario.cpf, {
			marcadoEm: brt(`${TERCA}T08:00`)
		});

		const p = await carregarPainelDia(a.id, TERCA, DEPOIS);
		expect(p.linhas).toHaveLength(0);
		expect(p.resumo.marcacoesDoDia).toBe(0);
	});

	it('atencao traz os mesmos números de carregarResumoAdmin', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);
		// Dia em aberto no mês de março.
		await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
			marcadoEm: brt(`${TERCA}T08:00`)
		});
		await prisma.ausencia.create({
			data: {
				colaboradorId: colaborador.id,
				empresaId: empresa.id,
				tipo: 'atestado',
				dataInicio: new Date('2026-03-20T00:00:00Z'),
				dataFim: new Date('2026-03-20T00:00:00Z'),
				status: 'pendente'
			}
		});

		const p = await carregarPainelDia(empresa.id, TERCA, DEPOIS);
		const r = await carregarResumoAdmin(empresa.id, DEPOIS);

		expect(p.atencao.diasEmAberto).toBe(1);
		expect(p.atencao.justificativasPendentes).toBe(1);
		expect(r).toEqual({ diasEmAberto: 1, justificativasPendentes: 1 });
	});
});
