/**
 * Banco de horas carregado do banco: configuração da empresa, saldo da empresa
 * batendo com o extrato individual, falta fora do banco e folga compensatória
 * consumindo saldo. As regras estão em `src/lib/server/banco-horas/montar.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/server/db';
import {
	carregarBancoEmpresa,
	carregarExtratoBanco,
	TIPO_FOLGA
} from '@/lib/server/banco-horas/carregar';
import { baterPonto, criarColaborador, criarEmpresa, vincularJornada } from './fixtures';

const brt = (s: string) => new Date(`${s}:00-03:00`);
const AGORA = brt('2026-03-13T09:00'); // sexta

async function comBanco(regime = 'mensal') {
	const empresa = await criarEmpresa();
	await prisma.empresa.update({
		where: { id: empresa.id },
		data: { bancoHorasRegime: regime, bancoHorasInicio: new Date('2026-03-01T00:00:00Z') }
	});
	return empresa;
}

async function dia(
	empresaId: string,
	colaboradorId: string,
	cpf: string,
	dia: string,
	horas: string[]
) {
	for (const h of horas) {
		await baterPonto(empresaId, colaboradorId, cpf, { marcadoEm: brt(`${dia}T${h}`) });
	}
}

describe('banco de horas', () => {
	it('regime nenhum: sem banco', async () => {
		const empresa = await criarEmpresa();
		expect(await carregarBancoEmpresa(empresa.id, AGORA)).toBeNull();
	});

	it('credita extra, debita atraso, ignora falta e consome a folga compensatória', async () => {
		const empresa = await comBanco();
		const { usuario, colaborador } = await criarColaborador(empresa.id, 'Ana Banco');
		await vincularJornada(empresa.id, colaborador.id); // seg–sex 08–12/13–17
		await prisma.colaborador.update({
			where: { id: colaborador.id },
			data: { dataAdmissao: new Date('2026-03-09T00:00:00Z') }
		});
		// Seg 09: 1h de extra. Ter 10: 30 min de atraso. Qua 11: falta. Qui 12: folga compensatória.
		await dia(empresa.id, colaborador.id, usuario.cpf, '2026-03-09', [
			'08:00',
			'12:00',
			'13:00',
			'18:00'
		]);
		await dia(empresa.id, colaborador.id, usuario.cpf, '2026-03-10', [
			'08:30',
			'12:00',
			'13:00',
			'17:00'
		]);
		await prisma.ausencia.create({
			data: {
				empresaId: empresa.id,
				colaboradorId: colaborador.id,
				tipo: TIPO_FOLGA,
				dataInicio: new Date('2026-03-12T00:00:00Z'),
				dataFim: new Date('2026-03-12T00:00:00Z'),
				status: 'aprovada'
			}
		});

		const banco = await carregarBancoEmpresa(empresa.id, AGORA);
		expect(banco?.atual).toEqual({ inicio: '2026-03-01', fim: '2026-03-31' });
		expect(banco?.linhas[0].atual).toMatchObject({
			creditoMin: 60,
			debitoMin: 30,
			folgaMin: 480,
			saldoMin: -450,
			encerrado: false
		});

		const extrato = await carregarExtratoBanco(empresa.id, colaborador.id, AGORA);
		expect(extrato?.ciclo?.saldoMin).toBe(-450);
		expect(extrato?.ciclo?.movimentos.map((m) => m.dia)).toEqual([
			'2026-03-09',
			'2026-03-10',
			'2026-03-12'
		]);
		expect(extrato?.folgas).toHaveLength(1);
	});

	it('ciclo anterior vencido aparece com o resultado', async () => {
		const empresa = await comBanco();
		const { usuario, colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);
		await dia(empresa.id, colaborador.id, usuario.cpf, '2026-03-02', [
			'08:00',
			'12:00',
			'13:00',
			'19:00'
		]);

		const banco = await carregarBancoEmpresa(empresa.id, brt('2026-04-02T09:00'));
		expect(banco?.anterior).toEqual({ inicio: '2026-03-01', fim: '2026-03-31' });
		// Março tem faltas (fora do banco); o que conta é a extra de 2h do dia 02.
		expect(banco?.linhas[0].anterior).toMatchObject({ resultado: 'pagar', resultadoMin: 120 });
	});

	it('extrato de colaborador de outra empresa: null', async () => {
		const a = await comBanco();
		const b = await criarEmpresa();
		const { colaborador } = await criarColaborador(b.id);
		expect(await carregarExtratoBanco(a.id, colaborador.id, AGORA)).toBeNull();
	});
});
