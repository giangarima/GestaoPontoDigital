/**
 * Carga do espelho de ponto a partir do banco: isolamento por empresa, dia de
 * Brasília nas batidas noturnas, ausência (data pura) no primeiro dia e PDF.
 * As regras do espelho estão em `src/lib/server/espelho/montar.test.ts`.
 */
import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { prisma } from '@/lib/server/db';
import { carregarEspelho, gerarEspelhoPdf } from '@/lib/server/espelho/gerar';
import { montarEspelho } from '@/lib/server/espelho/montar';
import { baterPonto, criarColaborador, criarEmpresa } from './fixtures';

const brt = (s: string) => new Date(`${s}:00-03:00`);

describe('carregarEspelho', () => {
	it('colaborador de outra empresa: null', async () => {
		const a = await criarEmpresa();
		const b = await criarEmpresa();
		const { colaborador } = await criarColaborador(b.id);
		expect(await carregarEspelho(a.id, colaborador.id, '2026-01-01', '2026-01-31')).toBeNull();
	});

	it('pega a batida das 23h do último dia e a ausência do primeiro dia', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id, 'Maria Noturna');
		await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
			marcadoEm: brt('2026-01-06T22:00')
		});
		await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
			marcadoEm: brt('2026-01-06T23:30')
		});
		// 00:30 do dia 07 já é fora do período.
		await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
			marcadoEm: brt('2026-01-07T00:30')
		});
		await prisma.ausencia.create({
			data: {
				empresaId: empresa.id,
				colaboradorId: colaborador.id,
				tipo: 'ferias',
				dataInicio: new Date('2026-01-05T00:00:00Z'),
				dataFim: new Date('2026-01-05T00:00:00Z'),
				status: 'aprovada'
			}
		});

		const carga = await carregarEspelho(
			empresa.id,
			colaborador.id,
			'2026-01-05',
			'2026-01-06',
			brt('2026-01-08T09:00')
		);
		const esp = montarEspelho(carga!.entrada);

		expect(carga!.registros).toHaveLength(2);
		expect(esp.dias.map((d) => [d.dia, d.ocorrencia, d.realizadoMin])).toEqual([
			['2026-01-05', 'Férias', 0],
			['2026-01-06', '', 103] // 90 min noturnos × 60/52,5
		]);
	});

	async function cargaSimples() {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id);
		await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
			marcadoEm: brt('2026-01-05T08:00')
		});
		return (await carregarEspelho(empresa.id, colaborador.id, '2026-01-01', '2026-01-31'))!;
	}

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('gera o PDF do espelho carregado (sem certificado: sem assinatura)', async () => {
		vi.stubEnv('COMPROVANTE_SKIP_SIGN', 'true');
		const pdf = await gerarEspelhoPdf((await cargaSimples()).entrada);

		expect(pdf.assinado).toBe(false);
		expect(pdf.nome).toBe('espelho_fulano_de_tal_2026-01-01_2026-01-31.pdf');
		expect((await PDFDocument.load(pdf.conteudo)).getPageCount()).toBeGreaterThanOrEqual(1);
	});

	it.skipIf(!existsSync('certs/rep-dev.p12'))(
		'com certificado, sai assinado em PAdES (ETSI.CAdES.detached)',
		async () => {
			vi.stubEnv('COMPROVANTE_SKIP_SIGN', 'false');
			vi.stubEnv('COMPROVANTE_CERT_BASE64', '');
			vi.stubEnv('COMPROVANTE_CERT_PATH', 'certs/rep-dev.p12');
			vi.stubEnv('COMPROVANTE_CERT_PASS', 'dev123');
			const pdf = await gerarEspelhoPdf((await cargaSimples()).entrada);
			const bruto = Buffer.from(pdf.conteudo).toString('latin1');

			expect(pdf.assinado).toBe(true);
			expect(bruto).toContain('/SubFilter /ETSI.CAdES.detached');
			expect(bruto).toMatch(/\/ByteRange \[0 \d+ \d+ \d+\]/);
		}
	);
});
