/**
 * Escala de folga carregada do banco: ciclo versionado, ajuste por cima do ciclo
 * e o efeito no espelho e no painel. As regras estão em
 * `src/lib/server/escala/calendario.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/server/db';
import { carregarEspelho } from '@/lib/server/espelho/gerar';
import { montarEspelho } from '@/lib/server/espelho/montar';
import { escalaDoColaborador } from '@/lib/server/escala/carregar';
import { carregarPainelDia } from '@/lib/server/painel/carregar';
import { criarColaborador, criarEmpresa, vincularJornada } from './fixtures';

const brt = (s: string) => new Date(`${s}:00-03:00`);
const data = (dia: string) => new Date(`${dia}T00:00:00Z`);

async function admin(empresaId: string) {
	return prisma.usuario.create({
		data: {
			empresaId,
			nome: 'Admin',
			email: `admin-${empresaId}@teste.com`,
			cpf: empresaId.slice(-11).padStart(11, '0'),
			senhaHash: 'x',
			role: 'admin'
		}
	});
}

describe('escalaDoColaborador', () => {
	it('traz todos os ciclos e só os ajustes do período', async () => {
		const empresa = await criarEmpresa();
		const a = await admin(empresa.id);
		const { colaborador } = await criarColaborador(empresa.id);
		await prisma.escalaCiclo.create({
			data: { colaboradorId: colaborador.id, vigenciaInicio: data('2026-01-01'), sequencia: 'TF' }
		});
		await prisma.escalaAjuste.createMany({
			data: [
				{
					colaboradorId: colaborador.id,
					data: data('2026-03-03'),
					trabalha: false,
					criadoPor: a.id
				},
				{ colaboradorId: colaborador.id, data: data('2026-04-01'), trabalha: true, criadoPor: a.id }
			]
		});

		const e = await escalaDoColaborador(colaborador.id, '2026-03-01', '2026-03-31');
		expect(e?.ciclos).toHaveLength(1);
		expect([...e!.ajustes]).toEqual([['2026-03-03', false]]);
		expect(await escalaDoColaborador('inexistente', '2026-03-01', '2026-03-31')).toBeNull();
	});
});

describe('escala no espelho e no painel', () => {
	it('espelho: folga do ciclo num dia útil não é falta; ajuste devolve o dia ao trabalho', async () => {
		const empresa = await criarEmpresa();
		const a = await admin(empresa.id);
		const { colaborador } = await criarColaborador(empresa.id);
		await vincularJornada(empresa.id, colaborador.id); // seg–sex 08–17
		// 2026-03-02 é segunda: folga na terça e na quarta, trabalho no resto da semana.
		await prisma.escalaCiclo.create({
			data: {
				colaboradorId: colaborador.id,
				vigenciaInicio: data('2026-03-02'),
				sequencia: 'TFFTTTT'
			}
		});
		await prisma.escalaAjuste.create({
			data: {
				colaboradorId: colaborador.id,
				data: data('2026-03-04'),
				trabalha: true,
				criadoPor: a.id
			}
		});

		const carga = await carregarEspelho(
			empresa.id,
			colaborador.id,
			'2026-03-02',
			'2026-03-05',
			brt('2026-03-20T09:00')
		);
		const esp = montarEspelho(carga!.entrada);
		expect(esp.dias.map((d) => [d.dia, d.ocorrencia])).toEqual([
			['2026-03-02', 'Falta'],
			['2026-03-03', 'Folga'],
			['2026-03-04', 'Falta'], // ajuste: trabalha
			['2026-03-05', 'Falta']
		]);
	});

	it('painel: folga de escala aparece como folga, não como falta provável', async () => {
		const empresa = await criarEmpresa();
		const { colaborador } = await criarColaborador(empresa.id, 'Ana Escala');
		await vincularJornada(empresa.id, colaborador.id);
		await prisma.escalaCiclo.create({
			data: {
				colaboradorId: colaborador.id,
				vigenciaInicio: data('2026-03-02'),
				sequencia: 'TFFTTTT'
			}
		});

		const p = await carregarPainelDia(empresa.id, '2026-03-03', brt('2026-03-20T09:00'));
		expect(p.linhas[0].situacao).toBe('folga');
		expect(p.semEscala).toBe(true);
		// Quarta também é folga pela escala: o próximo dia com expediente é a quinta.
		expect(p.navegacao?.proximo).toBe('2026-03-05');
	});
});
