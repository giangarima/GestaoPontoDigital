/**
 * Auditoria de integridade: hash-chain + sequência de NSR. Foca no que a
 * cadeia sozinha não detecta (exclusão da última batida e de eventos 2/5).
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/server/db';
import { auditarEmpresa } from '@/lib/server/auditoria';
import { verificarCadeia, registrarEventoEmpregado } from '@/lib/server/registro-ledger';
import { baterPonto, criarColaborador, criarEmpresa } from './fixtures';

async function empresaComBatidas(n: number) {
	const empresa = await criarEmpresa();
	const colab = await criarColaborador(empresa.id, 'Maria Auditada');
	for (let i = 0; i < n; i++) await baterPonto(empresa.id, colab.colaborador.id, colab.usuario.cpf);
	return { empresa, colab };
}

describe('auditarEmpresa', () => {
	it('empresa sem batidas é íntegra', async () => {
		const empresa = await criarEmpresa();
		const r = await auditarEmpresa(empresa.id);

		expect(r.integra).toBe(true);
		expect(r.cadeia.total).toBe(0);
		expect(r.sequencia).toEqual({ ultimoNsr: '0', totalAusentes: 0, ausentes: [] });
		expect(r.elos).toEqual([]);
	});

	it('diário intacto: íntegro, com os elos mais recentes primeiro', async () => {
		const { empresa } = await empresaComBatidas(12);
		const r = await auditarEmpresa(empresa.id);

		expect(r.integra).toBe(true);
		expect(r.quebra).toBeNull();
		expect(r.sequencia.ultimoNsr).toBe('12');
		expect(r.elos).toHaveLength(10);
		expect(r.elos.map((e) => e.nsr)).toEqual(['12', '11', '10', '9', '8', '7', '6', '5', '4', '3']);
		expect(r.elos[0].colaborador).toBe('Maria Auditada');
		expect(r.elos[0].hashAnterior).toBe(r.elos[1].hash);
	});

	it('batida alterada: aponta a quebra com os dados da batida', async () => {
		const { empresa } = await empresaComBatidas(4);
		await prisma.$executeRaw`
			UPDATE registros SET marcado_em = marcado_em + interval '2 hours'
			WHERE empresa_id = ${empresa.id} AND nsr = 2`;

		const r = await auditarEmpresa(empresa.id);
		expect(r.integra).toBe(false);
		expect(r.cadeia.motivo).toBe('hash não corresponde (conteúdo alterado)');
		expect(r.quebra).toMatchObject({ nsr: '2', colaborador: 'Maria Auditada', tipo: 'entrada' });
		expect(r.sequencia.totalAusentes).toBe(0);
	});

	it('exclusão da ÚLTIMA batida: a cadeia não percebe, a sequência de NSR sim', async () => {
		const { empresa } = await empresaComBatidas(5);
		await prisma.$executeRaw`DELETE FROM registros WHERE empresa_id = ${empresa.id} AND nsr = 5`;

		// A hash-chain sozinha continua "válida": nenhum elo aponta para a batida 5.
		expect((await verificarCadeia(empresa.id)).valida).toBe(true);

		const r = await auditarEmpresa(empresa.id);
		expect(r.integra).toBe(false);
		expect(r.cadeia.valida).toBe(true);
		expect(r.sequencia).toEqual({ ultimoNsr: '5', totalAusentes: 1, ausentes: ['5'] });
	});

	it('exclusão de evento de cadastro (tipo 5, fora da cadeia de hash) é detectada', async () => {
		const { empresa, colab } = await empresaComBatidas(2);
		const evento = await prisma.$transaction((tx) =>
			registrarEventoEmpregado(tx, {
				empresaId: empresa.id,
				operacao: 'I',
				cpfEmpregado: colab.usuario.cpf,
				nomeEmpregado: colab.usuario.nome,
				cpfResponsavel: '00000000000'
			})
		);
		await baterPonto(empresa.id, colab.colaborador.id, colab.usuario.cpf);
		await prisma.eventoEmpregado.delete({ where: { id: evento.id } });

		const r = await auditarEmpresa(empresa.id);
		expect(r.cadeia.valida).toBe(true);
		expect(r.integra).toBe(false);
		expect(r.sequencia.ausentes).toEqual(['3']);
	});

	it('exclusão no meio: quebra na cadeia e buraco na sequência', async () => {
		const { empresa } = await empresaComBatidas(5);
		await prisma.$executeRaw`DELETE FROM registros WHERE empresa_id = ${empresa.id} AND nsr IN (2, 3)`;

		const r = await auditarEmpresa(empresa.id);
		expect(r.integra).toBe(false);
		expect(r.quebra?.nsr).toBe('4');
		expect(r.sequencia).toMatchObject({ totalAusentes: 2, ausentes: ['2', '3'] });
	});
});
