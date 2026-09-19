/**
 * AEJ gerado a partir do banco: carrega vínculo, jornada vigente, marcações
 * originais, inclusões e desconsiderações do período. As regras do leiaute
 * estão cobertas em `src/lib/server/aej/montar.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/server/db';
import { gerarAej } from '@/lib/server/aej/gerar';
import { baterPonto, criarColaborador, criarEmpresa, incluirPonto } from './fixtures';

const brt = (s: string) => new Date(`${s}:00-03:00`);

describe('gerarAej', () => {
	it('traz originais, inclusão com motivo e desconsiderada, com o horário da jornada', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id, 'José da Conceição');
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
				empresaId: empresa.id,
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
			where: { id: colaborador.id },
			data: { jornadaId: jornada.id }
		});

		// Segunda 05/01/2026: entrada original às 08:40 ajustada para 08:00.
		const errada = await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
			marcadoEm: brt('2026-01-05T08:40')
		});
		const corrigida = await incluirPonto(
			empresa.id,
			colaborador.id,
			usuario.cpf,
			brt('2026-01-05T08:00'),
			'Relógio adiantado'
		);
		await prisma.registroAnulacao.create({
			data: {
				registroId: errada.id,
				registroSubstitutoId: corrigida.id,
				empresaId: empresa.id,
				motivo: 'Relógio adiantado',
				anuladoPor: corrigida.criadoPor!
			}
		});
		await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
			marcadoEm: brt('2026-01-05T12:00')
		});

		const aej = await gerarAej(
			empresa.id,
			{ inicio: brt('2026-01-05T00:00'), fim: new Date('2026-01-05T23:59:59.999-03:00') },
			brt('2026-01-06T09:00')
		);
		const linhas = Buffer.from(aej.conteudo).toString('latin1').split('\r\n');

		expect(aej.nome).toBe(`AEJ_${empresa.cnpj}_20260105_20260105.txt`);
		expect(linhas.at(-1)).toBe(''); // termina em CRLF
		expect(linhas).toContain(`03|1|${usuario.cpf}|José da Conceição`);
		expect(linhas).toContain('04|H1|480|0800|1200|1300|1700');
		expect(linhas.filter((l) => l.startsWith('05|'))).toEqual([
			'05|1|2026-01-05T08:00:00-0300||E|1|I|H1|Relógio adiantado',
			'05|1|2026-01-05T08:40:00-0300|1|D|1|O||Relógio adiantado',
			'05|1|2026-01-05T12:00:00-0300|1|S|1|O||'
		]);
		expect(linhas.at(-3)).toBe('99|1|1|1|1|3|0|0|1');
	});
});
