/**
 * Perfil do colaborador carregado do banco. As regras estão cobertas por
 * `src/lib/server/perfil/montar.test.ts`; aqui se verifica que presença e faltas
 * batem com o espelho do mesmo intervalo, que o saldo só difere dele pelos dias
 * fora da conta, o dia de referência, a semana e o escopo por empresa.
 */
import { describe, expect, it } from 'vitest';
import { carregarEspelho } from '@/lib/server/espelho/gerar';
import { montarEspelho } from '@/lib/server/espelho/montar';
import { carregarPerfil } from '@/lib/server/perfil/carregar';
import {
	baterPonto,
	criarColaborador,
	criarEmpresa,
	incluirPonto,
	vincularJornada
} from './fixtures';

const brt = (s: string) => new Date(`${s}:00-03:00`);
// Sábado (sem expediente): o dia de referência é a sexta. Período 30d até ontem.
const AGORA = brt('2026-10-10T10:00');

async function cenario(opcoes: { comAjuste: boolean }) {
	const empresa = await criarEmpresa();
	const { usuario, colaborador } = await criarColaborador(empresa.id, 'Bia Lima');
	await vincularJornada(empresa.id, colaborador.id);
	const bater = async (dia: string, horas: string[]) => {
		for (const h of horas)
			await baterPonto(empresa.id, colaborador.id, usuario.cpf, { marcadoEm: brt(`${dia}T${h}`) });
	};
	// Seg 05/10 falta. Ter pontual. Qua 25 min atrasada na entrada.
	await bater('2026-10-06', ['08:00', '12:00', '13:00', '17:00']);
	await bater('2026-10-07', ['08:25', '12:00', '13:00', '17:00']);
	if (opcoes.comAjuste) {
		// Qui: a entrada foi incluída pelo admin. Sex: esqueceu a última batida.
		await incluirPonto(empresa.id, colaborador.id, usuario.cpf, brt('2026-10-08T08:00'));
		await bater('2026-10-08', ['12:00', '13:00', '17:00']);
		await bater('2026-10-09', ['08:00', '12:00', '13:00']);
	} else {
		await bater('2026-10-08', ['08:00', '12:00', '13:00', '17:00']);
		await bater('2026-10-09', ['08:00', '12:00', '13:00', '17:00']);
	}
	return { empresa, colaborador };
}

async function espelhoDoPeriodo(
	empresaId: string,
	colaboradorId: string,
	inicio: string,
	fim: string
) {
	const carga = (await carregarEspelho(empresaId, colaboradorId, inicio, fim, AGORA))!;
	return montarEspelho(carga.entrada);
}

describe('carregarPerfil', () => {
	it('presença e faltas são as do espelho do mesmo intervalo', async () => {
		const { empresa, colaborador } = await cenario({ comAjuste: true });
		const p = (await carregarPerfil(empresa.id, colaborador.id, '30d', AGORA))!;
		const espelho = await espelhoDoPeriodo(
			empresa.id,
			colaborador.id,
			p.intervalo.inicio,
			p.intervalo.fim
		);

		expect(p.intervalo).toEqual({ inicio: '2026-09-10', fim: '2026-10-09' });
		expect(p.cards.presenca).toMatchObject({
			diasPrevistos: espelho.totais.diasPrevistos,
			faltas: espelho.totais.faltas,
			diasComMarcacao: 4
		});
	});

	it('sem dia de ajuste nem batida faltando, o saldo é o do espelho', async () => {
		const { empresa, colaborador } = await cenario({ comAjuste: false });
		const p = (await carregarPerfil(empresa.id, colaborador.id, '30d', AGORA))!;
		const espelho = await espelhoDoPeriodo(
			empresa.id,
			colaborador.id,
			p.intervalo.inicio,
			p.intervalo.fim
		);

		expect(p.cards.saldo).toMatchObject({
			realizadoMin: espelho.totais.realizadoMin,
			previstoMin: espelho.totais.previstoMin,
			diasComAjuste: 0,
			diasComBatidaFaltando: 0
		});
	});

	it('com ajuste, o saldo deixa esses dias de fora e diz quantos', async () => {
		const { empresa, colaborador } = await cenario({ comAjuste: true });
		const p = (await carregarPerfil(empresa.id, colaborador.id, '30d', AGORA))!;
		const espelho = await espelhoDoPeriodo(
			empresa.id,
			colaborador.id,
			p.intervalo.inicio,
			p.intervalo.fim
		);

		expect(p.cards.saldo).toMatchObject({ diasComAjuste: 1, diasComBatidaFaltando: 1 });
		// Os dois dias fora (8h previstas cada) explicam toda a diferença do previsto.
		expect(espelho.totais.previstoMin - p.cards.saldo.previstoMin).toBe(2 * 480);
	});

	it('sábado: o dia de referência é a sexta, e a semana vai de segunda até ela', async () => {
		const { empresa, colaborador } = await cenario({ comAjuste: true });
		const p = (await carregarPerfil(empresa.id, colaborador.id, '30d', AGORA))!;

		expect(p.colaborador).toMatchObject({ nome: 'Bia Lima', jornada: 'Comercial' });
		expect(p.dia).toMatchObject({
			rotulo: 'ultimo',
			dia: { dia: '2026-10-09', situacao: 'aberto' },
			chip: { texto: 'Batida faltando', tom: 'aviso' }
		});
		expect(p.semana).toMatchObject({
			inicio: '2026-10-05',
			fim: '2026-10-09',
			// Ter 8h + qua 7h35; previsto inclui a falta de segunda.
			realizadoMin: 935,
			previstoMin: 1440,
			diasForaDaConta: 2,
			atrasosEntrada: 1,
			faltas: 1
		});
		expect(p.semana!.dias.find((d) => d.dia === '2026-10-08')!.marcacoes[0]).toEqual({
			hora: '08:00',
			incluida: true
		});
		expect(p.periodosDisponiveis).toEqual(['30d', '3m', '6m', '12m']);
	});

	it('não enxerga colaborador de outra empresa', async () => {
		const { colaborador } = await cenario({ comAjuste: false });
		const outra = await criarEmpresa();
		expect(await carregarPerfil(outra.id, colaborador.id, '30d', AGORA)).toBeNull();
	});
});
