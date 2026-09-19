/**
 * Eventos sensíveis do REP-P (AFD tipo 6): disponibilidade "07" e
 * indisponibilidade "08" de serviço, com NSR na sequência unificada, no AFD e
 * na auditoria de NSRs.
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/server/db';
import {
	registrarDisponibilidade,
	registrarIndisponibilidade,
	registrarInicioDoServidor,
	registrarParadaDoServidor
} from '@/lib/server/disponibilidade';
import { gerarAfd } from '@/lib/server/afd/gerar';
import { auditarEmpresa } from '@/lib/server/auditoria';
import { baterPonto, criarColaborador, criarEmpresa } from './fixtures';

async function eventos(empresaId: string) {
	const rows = await prisma.eventoSensivel.findMany({
		where: { empresaId },
		orderBy: { nsr: 'asc' }
	});
	return rows.map((r) => `${r.nsr}:${r.tipoEvento}`);
}

describe('disponibilidade do REP-P', () => {
	it('início grava "07"; parada ordenada grava "08"; parada repetida não duplica', async () => {
		const empresa = await criarEmpresa();

		expect(await registrarDisponibilidade(empresa.id)).toEqual(['07']);
		expect(await registrarIndisponibilidade(empresa.id)).toBe(true);
		expect(await registrarIndisponibilidade(empresa.id)).toBe(false);
		expect(await eventos(empresa.id)).toEqual(['1:07', '2:08']);
	});

	it('queda sem aviso: o próximo início grava o "08" pendente antes do novo "07"', async () => {
		const empresa = await criarEmpresa();
		await registrarDisponibilidade(empresa.id);
		// ...processo morto por SIGKILL: nenhum "08"...
		expect(await registrarDisponibilidade(empresa.id)).toEqual(['08', '07']);
		expect(await eventos(empresa.id)).toEqual(['1:07', '2:08', '3:07']);
	});

	it('eventos consomem NSR da mesma sequência das batidas', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id);
		await registrarDisponibilidade(empresa.id);
		const batida = await baterPonto(empresa.id, colaborador.id, usuario.cpf);
		await registrarIndisponibilidade(empresa.id);

		expect(batida.nsr).toBe(2n);
		expect(await eventos(empresa.id)).toEqual(['1:07', '3:08']);
	});

	it('início e parada do servidor valem para cada empresa', async () => {
		const a = await criarEmpresa();
		const b = await criarEmpresa();
		// Restrito a `a` e `b`: o banco de teste é compartilhado com os outros arquivos.
		await registrarInicioDoServidor([a.id, b.id]);
		await registrarParadaDoServidor([a.id, b.id]);

		expect(await eventos(a.id)).toEqual(['1:07', '2:08']);
		expect(await eventos(b.id)).toEqual(['1:07', '2:08']);
	});

	it('o banco recusa código de evento fora do leiaute do REP-P', async () => {
		const empresa = await criarEmpresa();
		await expect(
			prisma.eventoSensivel.create({ data: { empresaId: empresa.id, nsr: 1n, tipoEvento: '01' } })
		).rejects.toThrow(/eventos_sensiveis_tipo_evento_check/);
	});
});

describe('tipo 6 no AFD e na auditoria', () => {
	it('linhas de 36 posições, sem CRC, na ordem de NSR, e contadas no trailer', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id);
		await registrarDisponibilidade(empresa.id); // NSR 1
		await baterPonto(empresa.id, colaborador.id, usuario.cpf, {
			marcadoEm: new Date('2026-01-05T11:00:00Z')
		}); // NSR 2
		await registrarIndisponibilidade(empresa.id); // NSR 3

		const afd = await gerarAfd(empresa.id);
		const linhas = Buffer.from(afd.conteudo).toString('latin1').split('\r\n');
		const tipo6 = linhas.filter((l) => /^\d{9}6/.test(l));

		expect(tipo6).toHaveLength(2);
		tipo6.forEach((l) => expect(l).toHaveLength(36));
		expect(tipo6[0].slice(0, 10)).toBe('0000000016');
		expect(tipo6[0].slice(-2)).toBe('07');
		expect(tipo6[1].slice(0, 10)).toBe('0000000036');
		expect(tipo6[1].slice(-2)).toBe('08');
		expect(linhas.slice(1, 4).map((l) => l[9])).toEqual(['6', '7', '6']);

		const trailer = linhas.at(-3)!;
		expect(trailer.slice(45, 54)).toBe('000000002'); // tipo 6
		expect(trailer.slice(54, 63)).toBe('000000001'); // tipo 7
	});

	it('auditoria conta os NSRs do tipo 6: sem buraco com eventos, buraco se um some', async () => {
		const empresa = await criarEmpresa();
		const { usuario, colaborador } = await criarColaborador(empresa.id);
		await registrarDisponibilidade(empresa.id);
		await baterPonto(empresa.id, colaborador.id, usuario.cpf);

		expect((await auditarEmpresa(empresa.id)).sequencia.totalAusentes).toBe(0);

		await prisma.$executeRaw`DELETE FROM eventos_sensiveis WHERE empresa_id = ${empresa.id}`;
		const depois = await auditarEmpresa(empresa.id);
		expect(depois.sequencia.ausentes).toEqual(['1']);
	});
});
