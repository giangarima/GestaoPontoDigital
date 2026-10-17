/**
 * Perfil do colaborador carregado do banco. As regras estão cobertas por
 * `src/lib/server/perfil/montar.test.ts`; aqui se verifica que o perfil bate com o
 * espelho do mesmo intervalo, o corte entre período atual e anterior e o escopo.
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/server/db';
import { carregarEspelho } from '@/lib/server/espelho/gerar';
import { montarEspelho } from '@/lib/server/espelho/montar';
import { carregarPerfil } from '@/lib/server/perfil/carregar';
import { baterPonto, criarColaborador, criarEmpresa, vincularJornada } from './fixtures';

const brt = (s: string) => new Date(`${s}:00-03:00`);
// Período 30d até ontem (16/10/2026): de 17/09 a 16/10. Anterior: 18/08 a 16/09.
const AGORA = brt('2026-10-17T10:00');

async function cenario() {
	const empresa = await criarEmpresa();
	const { usuario, colaborador } = await criarColaborador(empresa.id, 'Bia Lima');
	await vincularJornada(empresa.id, colaborador.id);
	const bater = async (dia: string, horas: string[], localizacao: string | null = null) => {
		for (const h of horas) {
			await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
				marcadoEm: brt(`${dia}T${h}`),
				geo: localizacao
					? {
							latitude: -30,
							longitude: -51,
							precisaoM: 10,
							localizacao: localizacao as 'dentro',
							localTrabalhoId: null,
							distanciaM: 10
						}
					: undefined
			});
		}
	};
	// Atual: ter 06/10 pontual, qua 07/10 com 25 min de atraso e uma batida fora do local.
	await bater('2026-10-06', ['08:00', '12:00', '13:00', '17:00'], 'dentro');
	await bater('2026-10-07', ['08:25'], 'fora');
	await bater('2026-10-07', ['12:00', '13:00', '17:00'], 'dentro');
	// Anterior: ter 08/09 pontual.
	await bater('2026-09-08', ['08:00', '12:00', '13:00', '17:00']);
	return { empresa, colaborador };
}

describe('carregarPerfil', () => {
	it('os totais batem com o espelho do mesmo intervalo', async () => {
		const { empresa, colaborador } = await cenario();
		const p = (await carregarPerfil(empresa.id, colaborador.id, '30d', AGORA))!;

		const carga = (await carregarEspelho(
			empresa.id,
			colaborador.id,
			p.atual.inicio,
			p.atual.fim,
			AGORA
		))!;
		const espelho = montarEspelho(carga.entrada);

		expect(p.atual).toEqual({ inicio: '2026-09-17', fim: '2026-10-16' });
		expect(p.perfil.resumo.horas).toMatchObject({
			realizadoMin: espelho.totais.realizadoMin,
			previstoMin: espelho.totais.previstoMin,
			extraMin: espelho.totais.extraMin,
			deficitMin: espelho.totais.deficitMin
		});
		expect(p.perfil.resumo.assiduidade.faltas).toBe(espelho.totais.faltas);
		expect(p.perfil.dias).toHaveLength(30);
	});

	it('separa atual e anterior, com atraso, local e cabeçalho', async () => {
		const { empresa, colaborador } = await cenario();
		const p = (await carregarPerfil(empresa.id, colaborador.id, '30d', AGORA))!;

		expect(p.colaborador).toMatchObject({ nome: 'Bia Lima', jornada: 'Comercial' });
		expect(p.perfil.resumo.pontualidade).toMatchObject({ diasAvaliados: 2, diasComAtraso: 1 });
		expect(p.perfil.resumo.pontualidade.atrasoMedioMin).toBe(25);
		expect(p.perfil.resumo.local).toEqual({
			batidas: 8,
			conferidas: 8,
			fora: 1,
			semLocalizacao: 0
		});
		// A batida de setembro (dia 08, no período anterior) não entra no atual.
		expect(p.resumoAnterior.pontualidade).toMatchObject({ diasAvaliados: 1, diasComAtraso: 0 });
		expect(p.resumoAnterior.local).toMatchObject({ batidas: 4, conferidas: 0 });
		// Empresa de teste não configura banco de horas.
		expect(p.banco).toBeNull();
	});

	it('não enxerga colaborador de outra empresa', async () => {
		const { colaborador } = await cenario();
		const outra = await criarEmpresa();
		expect(await carregarPerfil(outra.id, colaborador.id, '30d', AGORA)).toBeNull();
	});

	it('banco de horas: saldo do ciclo atual quando a empresa usa banco', async () => {
		const { empresa, colaborador } = await cenario();
		await prisma.empresa.update({
			where: { id: empresa.id },
			data: { bancoHorasRegime: 'mensal', bancoHorasInicio: new Date('2026-01-01T00:00:00Z') }
		});
		const p = (await carregarPerfil(empresa.id, colaborador.id, '30d', AGORA))!;
		expect(p.banco).toMatchObject({ inicio: '2026-10-01', fim: '2026-10-31' });
		expect(typeof p.banco!.saldoMin).toBe('number');
	});
});
