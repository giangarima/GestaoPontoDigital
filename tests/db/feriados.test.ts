/**
 * Feriados carregados do banco: nacionais calculados + locais da empresa, e o
 * efeito no espelho e no painel. As regras estão nos testes puros
 * (`feriado/calendario.test.ts`, `espelho/montar.test.ts`, `painel/montar.test.ts`).
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/server/db';
import { carregarEspelho } from '@/lib/server/espelho/gerar';
import { montarEspelho } from '@/lib/server/espelho/montar';
import { feriadosDoPeriodo } from '@/lib/server/feriado/carregar';
import { carregarPainelDia } from '@/lib/server/painel/carregar';
import { criarColaborador, criarEmpresa, vincularJornada } from './fixtures';

const brt = (s: string) => new Date(`${s}:00-03:00`);

async function feriadoLocal(
	empresaId: string,
	dia: string,
	nome: string,
	extra: { tipo?: string; abrangencia?: string; escalados?: string[] } = {}
) {
	const { escalados = [], ...resto } = extra;
	return prisma.feriado.create({
		data: {
			empresaId,
			data: new Date(`${dia}T00:00:00Z`),
			nome,
			...resto,
			escala: { create: escalados.map((colaboradorId) => ({ colaboradorId })) }
		}
	});
}

describe('feriadosDoPeriodo', () => {
	it('junta nacionais e locais da própria empresa, recortados no período', async () => {
		const a = await criarEmpresa();
		const b = await criarEmpresa();
		await feriadoLocal(a.id, '2026-04-03', 'Sexta-feira Santa');
		await feriadoLocal(a.id, '2026-05-10', 'Fora do período');
		await feriadoLocal(b.id, '2026-04-23', 'São Jorge');

		const f = await feriadosDoPeriodo(a.id, '2026-04-01', '2026-04-30');
		expect([...f].map(([dia, x]) => [dia, x.nome, x.abrangencia])).toEqual([
			['2026-04-21', 'Tiradentes', 'nacional'],
			['2026-04-03', 'Sexta-feira Santa', 'municipal']
		]);
	});

	it('escala num feriado nacional: a linha só guarda quem trabalha', async () => {
		const empresa = await criarEmpresa();
		const { colaborador } = await criarColaborador(empresa.id);
		await feriadoLocal(empresa.id, '2026-04-21', 'ignorado', {
			abrangencia: 'nacional',
			escalados: [colaborador.id]
		});

		const f = await feriadosDoPeriodo(empresa.id, '2026-04-21', '2026-04-21');
		expect(f.get('2026-04-21')).toEqual({
			nome: 'Tiradentes',
			tipo: 'feriado',
			abrangencia: 'nacional',
			escalados: new Set([colaborador.id])
		});
	});
});

describe('feriado no espelho e no painel', () => {
	it('espelho: feriado nacional e local em dia útil não viram falta', async () => {
		const empresa = await criarEmpresa();
		const { colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);
		await feriadoLocal(empresa.id, '2026-04-20', 'Ponte municipal');

		// Seg 20/04 (local) e ter 21/04 (Tiradentes), sem nenhuma marcação.
		const carga = await carregarEspelho(
			empresa.id,
			colaborador.id,
			'2026-04-20',
			'2026-04-22',
			brt('2026-04-25T09:00')
		);
		const esp = montarEspelho(carga!.entrada);
		expect(esp.dias.map((d) => [d.dia, d.ocorrencia, d.falta])).toEqual([
			['2026-04-20', 'Feriado (Ponte municipal)', false],
			['2026-04-21', 'Feriado (Tiradentes)', false],
			['2026-04-22', 'Falta', true]
		]);
	});

	it('painel: dia de feriado fica sem escala e a navegação pula o feriado vizinho', async () => {
		const empresa = await criarEmpresa();
		const { colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id);
		await feriadoLocal(empresa.id, '2026-03-03', 'Feriado municipal'); // terça
		await feriadoLocal(empresa.id, '2026-03-02', 'Ponte'); // segunda

		const p = await carregarPainelDia(empresa.id, '2026-03-03', brt('2026-03-20T09:00'));
		expect(p.feriado).toMatchObject({ nome: 'Feriado municipal', escalados: 0 });
		expect(p.semEscala).toBe(true);
		expect(p.linhas[0]).toMatchObject({ situacao: 'feriado', atrasado: false });
		expect(p.resumo).toMatchObject({ feriados: 1, faltasProvaveis: 0 });
		// Segunda também é feriado: o vizinho anterior com expediente é a sexta 27/02.
		expect(p.navegacao).toEqual({ anterior: '2026-02-27', proximo: '2026-03-04' });
	});

	it('espelho: escalado no feriado segue a jornada; quem não está, folga', async () => {
		const empresa = await criarEmpresa();
		const escalado = await criarColaborador(empresa.id, 'Ana Escalada');
		const folguista = await criarColaborador(empresa.id, 'Bruno Folga');
		await vincularJornada(empresa.id, escalado.colaborador.id);
		await vincularJornada(empresa.id, folguista.colaborador.id);
		await feriadoLocal(empresa.id, '2026-04-20', 'Aniversário da cidade', {
			escalados: [escalado.colaborador.id]
		});

		const ocorrencia = async (colaboradorId: string) => {
			const carga = await carregarEspelho(
				empresa.id,
				colaboradorId,
				'2026-04-20',
				'2026-04-20',
				brt('2026-04-25T09:00')
			);
			const [dia] = montarEspelho(carga!.entrada).dias;
			return [dia.ocorrencia, dia.falta];
		};
		expect(await ocorrencia(escalado.colaborador.id)).toEqual(['Falta', true]);
		expect(await ocorrencia(folguista.colaborador.id)).toEqual([
			'Feriado (Aniversário da cidade)',
			false
		]);
	});

	it('painel: feriado aberto com equipe reduzida acompanha só os escalados', async () => {
		const empresa = await criarEmpresa();
		const escalado = await criarColaborador(empresa.id, 'Ana Escalada');
		const folguista = await criarColaborador(empresa.id, 'Bruno Folga');
		await vincularJornada(empresa.id, escalado.colaborador.id);
		await vincularJornada(empresa.id, folguista.colaborador.id);
		await feriadoLocal(empresa.id, '2026-03-03', 'Feriado municipal', {
			escalados: [escalado.colaborador.id]
		});

		const p = await carregarPainelDia(empresa.id, '2026-03-03', brt('2026-03-20T09:00'));
		expect(p.semEscala).toBe(false);
		expect(p.feriado).toMatchObject({ nome: 'Feriado municipal', escalados: 1 });
		const situacao = Object.fromEntries(p.linhas.map((l) => [l.nome, l.situacao]));
		expect(situacao).toEqual({ 'Ana Escalada': 'falta_provavel', 'Bruno Folga': 'feriado' });
	});
});
