/**
 * Ledger de marcações contra Postgres real: NSR sequencial, hash-chain,
 * concorrência e detecção de adulteração (Portaria 671/2021).
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/server/db';
import { hashRegistro } from '@/lib/server/registro-hash';
import {
	registrarEventoEmpregado,
	registrarEventoEmpregador,
	verificarCadeia
} from '@/lib/server/registro-ledger';
import { baterPonto, criarColaborador, criarEmpresa } from './fixtures';

/** NSRs de todos os eventos da empresa (tipos 2, 5 e 7), ordenados. */
async function todosNsrs(empresaId: string): Promise<number[]> {
	const [regs, emp, empr] = await Promise.all([
		prisma.registro.findMany({ where: { empresaId }, select: { nsr: true } }),
		prisma.eventoEmpregado.findMany({ where: { empresaId }, select: { nsr: true } }),
		prisma.eventoEmpregador.findMany({ where: { empresaId }, select: { nsr: true } })
	]);
	return [...regs, ...emp, ...empr].map((r) => Number(r.nsr)).sort((a, b) => a - b);
}

function sequencia(n: number): number[] {
	return Array.from({ length: n }, (_, i) => i + 1);
}

describe('criarRegistro: NSR e hash-chain', () => {
	it('numera as batidas 1, 2, 3… e encadeia cada uma na anterior', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id);

		const r1 = await baterPonto(empresa.id, colaborador.id, usuario.cpf);
		const r2 = await baterPonto(empresa.id, colaborador.id, usuario.cpf);
		const r3 = await baterPonto(empresa.id, colaborador.id, usuario.cpf);

		expect([r1.nsr, r2.nsr, r3.nsr]).toEqual([1n, 2n, 3n]);
		expect(r1.hashAnterior).toBeNull();
		expect(r2.hashAnterior).toBe(r1.hash);
		expect(r3.hashAnterior).toBe(r2.hash);
		expect(await verificarCadeia(empresa.id)).toMatchObject({ total: 3, valida: true });
	});

	it('cada empresa tem a própria sequência de NSR', async () => {
		const a = await criarEmpresa();
		const b = await criarEmpresa();
		const ca = await criarColaborador(a.id);
		const cb = await criarColaborador(b.id);

		await baterPonto(a.id, ca.colaborador.id, ca.usuario.cpf);
		await baterPonto(a.id, ca.colaborador.id, ca.usuario.cpf);
		const primeiraDeB = await baterPonto(b.id, cb.colaborador.id, cb.usuario.cpf);

		expect(primeiraDeB.nsr).toBe(1n);
		expect(primeiraDeB.hashAnterior).toBeNull();
	});

	it('eventos de empregador/empregado consomem NSR mas não entram na cadeia de hash', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id);

		const r1 = await baterPonto(empresa.id, colaborador.id, usuario.cpf);
		const evento = await prisma.$transaction((tx) =>
			registrarEventoEmpregado(tx, {
				empresaId: empresa.id,
				operacao: 'I',
				cpfEmpregado: usuario.cpf,
				nomeEmpregado: usuario.nome,
				cpfResponsavel: '00000000000'
			})
		);
		const r2 = await baterPonto(empresa.id, colaborador.id, usuario.cpf);

		expect([r1.nsr, evento.nsr, r2.nsr]).toEqual([1n, 2n, 3n]);
		expect(r2.hashAnterior).toBe(r1.hash);
		expect(await verificarCadeia(empresa.id)).toMatchObject({ valida: true });
	});

	it('transação que falha não consome NSR (sem buraco na sequência)', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id);

		await baterPonto(empresa.id, colaborador.id, usuario.cpf);
		await expect(
			// colaborador inexistente → FK falha depois de o NSR ter sido alocado
			baterPonto(empresa.id, 'colaborador-inexistente', usuario.cpf)
		).rejects.toThrow();
		const depois = await baterPonto(empresa.id, colaborador.id, usuario.cpf);

		expect(depois.nsr).toBe(2n);
	});
});

describe('concorrência', () => {
	const N = 40;

	it(`${N} batidas simultâneas: NSRs 1..${N} sem buraco nem duplicata, cadeia sem bifurcação`, async () => {
		const empresa = await criarEmpresa();
		const colaboradores = await Promise.all(
			Array.from({ length: 5 }, (_, i) => criarColaborador(empresa.id, `Colaborador ${i}`))
		);

		const resultados = await Promise.allSettled(
			Array.from({ length: N }, (_, i) => {
				const { usuario, colaborador } = colaboradores[i % colaboradores.length];
				return baterPonto(empresa.id, colaborador.id, usuario.cpf);
			})
		);

		expect(resultados.filter((r) => r.status === 'rejected')).toEqual([]);
		expect(await todosNsrs(empresa.id)).toEqual(sequencia(N));

		// Sem bifurcação: nenhum hash é o "anterior" de duas batidas diferentes.
		const regs = await prisma.registro.findMany({ where: { empresaId: empresa.id } });
		const anteriores = regs.map((r) => r.hashAnterior);
		expect(new Set(anteriores).size).toBe(N);
		expect(anteriores.filter((h) => h === null)).toHaveLength(1);

		expect(await verificarCadeia(empresa.id)).toEqual({
			total: N,
			valida: true,
			quebraNsr: null,
			motivo: null
		});

		const { ultimoNsr } = await prisma.empresa.findUniqueOrThrow({ where: { id: empresa.id } });
		expect(ultimoNsr).toBe(BigInt(N));
	});

	it('batidas e eventos de cadastro simultâneos compartilham a mesma sequência', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id);

		const operacoes = Array.from({ length: 30 }, (_, i) => {
			if (i % 3 === 1)
				return prisma.$transaction((tx) =>
					registrarEventoEmpregado(tx, {
						empresaId: empresa.id,
						operacao: 'A',
						cpfEmpregado: usuario.cpf,
						nomeEmpregado: usuario.nome,
						cpfResponsavel: '00000000000'
					})
				);
			if (i % 3 === 2)
				return prisma.$transaction((tx) =>
					registrarEventoEmpregador(tx, {
						empresaId: empresa.id,
						cpfResponsavel: '00000000000',
						inscricaoTipo: '1',
						inscricao: empresa.cnpj!,
						razaoSocial: 'Empresa Teste Ltda'
					})
				);
			return baterPonto(empresa.id, colaborador.id, usuario.cpf);
		});
		await Promise.all(operacoes);

		expect(await todosNsrs(empresa.id)).toEqual(sequencia(30));
		expect(await verificarCadeia(empresa.id)).toMatchObject({ total: 10, valida: true });
	});
});

describe('verificarCadeia: detecção de adulteração', () => {
	async function empresaCom5Batidas() {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id);
		for (let i = 0; i < 5; i++) await baterPonto(empresa.id, colaborador.id, usuario.cpf);
		return empresa;
	}

	it('alterar o horário de uma batida direto no banco quebra a cadeia naquele NSR', async () => {
		const empresa = await empresaCom5Batidas();
		await prisma.$executeRaw`
			UPDATE registros SET marcado_em = marcado_em - interval '1 hour'
			WHERE empresa_id = ${empresa.id} AND nsr = 3`;

		expect(await verificarCadeia(empresa.id)).toEqual({
			total: 5,
			valida: false,
			quebraNsr: '3',
			motivo: 'hash não corresponde (conteúdo alterado)'
		});
	});

	it('trocar o CPF de uma batida é detectado', async () => {
		const empresa = await empresaCom5Batidas();
		await prisma.$executeRaw`
			UPDATE registros SET cpf = '99999999999' WHERE empresa_id = ${empresa.id} AND nsr = 2`;

		expect(await verificarCadeia(empresa.id)).toMatchObject({ valida: false, quebraNsr: '2' });
	});

	it('apagar uma batida do meio quebra o elo da seguinte', async () => {
		const empresa = await empresaCom5Batidas();
		await prisma.$executeRaw`DELETE FROM registros WHERE empresa_id = ${empresa.id} AND nsr = 3`;

		expect(await verificarCadeia(empresa.id)).toEqual({
			total: 4,
			valida: false,
			quebraNsr: '4',
			motivo: 'hashAnterior não corresponde'
		});
	});

	it('recalcular o hash da batida adulterada não esconde a fraude: quebra na seguinte', async () => {
		const empresa = await empresaCom5Batidas();
		// Fraude "caprichada": muda a batida 3 e grava nela o hash CORRETO do conteúdo
		// novo. A 3 passa a conferir, mas a 4 continua apontando para o hash antigo.
		const r3 = await prisma.registro.findFirstOrThrow({ where: { empresaId: empresa.id, nsr: 3 } });
		const marcadoEm = new Date(r3.marcadoEm.getTime() - 3600_000);
		const hashForjado = hashRegistro({ ...r3, marcadoEm }, r3.hashAnterior);
		await prisma.$executeRaw`
			UPDATE registros SET marcado_em = ${marcadoEm}, hash = ${hashForjado} WHERE id = ${r3.id}`;

		expect(await verificarCadeia(empresa.id)).toEqual({
			total: 5,
			valida: false,
			quebraNsr: '4',
			motivo: 'hashAnterior não corresponde'
		});
	});
});
