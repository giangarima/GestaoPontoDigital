/**
 * Diário do REP somente inserção (Portaria 671/2021, Anexo IX, item 7): os
 * triggers da migration `diario_somente_insercao` recusam alterar ou apagar o
 * que já foi gravado — a auditoria detecta adulteração, o banco agora impede.
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/server/db';
import {
	registrarEventoEmpregado,
	registrarEventoEmpregador,
	registrarEventoSensivel
} from '@/lib/server/registro-ledger';
import { baterPonto, criarColaborador, criarEmpresa } from './fixtures';

const SOMENTE_INSERCAO = /somente inserção/;

async function empresaComBatida() {
	const empresa = await criarEmpresa();
	const { usuario, colaborador } = await criarColaborador(empresa.id);
	const registro = await baterPonto(empresa.id, colaborador.id, usuario.cpf);
	return { empresa, usuario, registro };
}

describe('marcações (registros)', () => {
	it('UPDATE é recusado, inclusive pelo Prisma', async () => {
		const { registro } = await empresaComBatida();
		await expect(
			prisma.$executeRaw`UPDATE registros SET marcado_em = now() WHERE id = ${registro.id}`
		).rejects.toThrow(SOMENTE_INSERCAO);
		await expect(
			prisma.registro.update({ where: { id: registro.id }, data: { tipo: 'saida' } })
		).rejects.toThrow(SOMENTE_INSERCAO);
	});

	it('DELETE e TRUNCATE são recusados', async () => {
		const { registro } = await empresaComBatida();
		await expect(prisma.registro.delete({ where: { id: registro.id } })).rejects.toThrow(
			SOMENTE_INSERCAO
		);
		await expect(prisma.$executeRawUnsafe('TRUNCATE registros CASCADE')).rejects.toThrow(
			SOMENTE_INSERCAO
		);
		expect(await prisma.registro.count({ where: { id: registro.id } })).toBe(1);
	});
});

describe('eventos do AFD (tipos 2, 5 e 6)', () => {
	it('não se alteram nem se apagam', async () => {
		const { empresa, usuario } = await empresaComBatida();
		const [empregador, empregado, sensivel] = await prisma.$transaction(async (tx) => [
			await registrarEventoEmpregador(tx, {
				empresaId: empresa.id,
				cpfResponsavel: usuario.cpf,
				inscricaoTipo: '1',
				inscricao: empresa.cnpj!,
				razaoSocial: 'Empresa Teste Ltda'
			}),
			await registrarEventoEmpregado(tx, {
				empresaId: empresa.id,
				operacao: 'I',
				cpfEmpregado: usuario.cpf,
				nomeEmpregado: usuario.nome,
				cpfResponsavel: usuario.cpf
			}),
			await registrarEventoSensivel(tx, { empresaId: empresa.id, tipoEvento: '07' })
		]);

		await expect(
			prisma.eventoEmpregador.update({
				where: { id: empregador.id },
				data: { razaoSocial: 'Outra' }
			})
		).rejects.toThrow(SOMENTE_INSERCAO);
		await expect(prisma.eventoEmpregado.delete({ where: { id: empregado.id } })).rejects.toThrow(
			SOMENTE_INSERCAO
		);
		await expect(prisma.eventoSensivel.delete({ where: { id: sensivel.id } })).rejects.toThrow(
			SOMENTE_INSERCAO
		);
	});
});

describe('anulações (tratamento)', () => {
	async function anulada() {
		const { empresa, usuario, registro } = await empresaComBatida();
		const anulacao = await prisma.registroAnulacao.create({
			data: {
				registroId: registro.id,
				empresaId: empresa.id,
				motivo: 'Clique duplicado',
				anuladoPor: usuario.id
			}
		});
		return { usuario, anulacao };
	}

	it('não se altera e só sai com a cópia no histórico de revertidas', async () => {
		const { usuario, anulacao } = await anulada();

		await expect(
			prisma.registroAnulacao.update({ where: { id: anulacao.id }, data: { motivo: 'Outro' } })
		).rejects.toThrow(SOMENTE_INSERCAO);
		await expect(prisma.registroAnulacao.delete({ where: { id: anulacao.id } })).rejects.toThrow(
			SOMENTE_INSERCAO
		);

		// O caminho da rota DELETE /registro/:id/anular: copia e apaga na mesma transação.
		await prisma.$transaction([
			prisma.registroAnulacaoRevertida.create({
				data: {
					anulacaoId: anulacao.id,
					registroId: anulacao.registroId,
					empresaId: anulacao.empresaId,
					motivo: anulacao.motivo,
					anuladoPor: anulacao.anuladoPor,
					anuladoEm: anulacao.anuladoEm,
					revertidoPor: usuario.id
				}
			}),
			prisma.registroAnulacao.delete({ where: { id: anulacao.id } })
		]);

		expect(await prisma.registroAnulacao.count({ where: { id: anulacao.id } })).toBe(0);
		const revertida = await prisma.registroAnulacaoRevertida.findUniqueOrThrow({
			where: { anulacaoId: anulacao.id }
		});
		expect(revertida).toMatchObject({ motivo: 'Clique duplicado', revertidoPor: usuario.id });

		// O histórico também é somente inserção.
		await expect(
			prisma.registroAnulacaoRevertida.delete({ where: { id: revertida.id } })
		).rejects.toThrow(SOMENTE_INSERCAO);
	});

	it('a batida pode ser anulada de novo depois de revertida', async () => {
		const { usuario, anulacao } = await anulada();
		await prisma.$transaction([
			prisma.registroAnulacaoRevertida.create({
				data: {
					anulacaoId: anulacao.id,
					registroId: anulacao.registroId,
					empresaId: anulacao.empresaId,
					motivo: anulacao.motivo,
					anuladoPor: anulacao.anuladoPor,
					anuladoEm: anulacao.anuladoEm,
					revertidoPor: usuario.id
				}
			}),
			prisma.registroAnulacao.delete({ where: { id: anulacao.id } })
		]);

		const nova = await prisma.registroAnulacao.create({
			data: {
				registroId: anulacao.registroId,
				empresaId: anulacao.empresaId,
				motivo: 'Agora sim, duplicada',
				anuladoPor: usuario.id
			}
		});
		expect(nova.registroId).toBe(anulacao.registroId);
	});
});

describe('empresas', () => {
	it('o cadastro continua editável e o NSR avança', async () => {
		const { empresa } = await empresaComBatida();
		await prisma.empresa.update({ where: { id: empresa.id }, data: { nome: 'Nome Novo' } });
		const depois = await prisma.empresa.findUniqueOrThrow({ where: { id: empresa.id } });
		expect(depois).toMatchObject({ nome: 'Nome Novo', ultimoNsr: 1n });
	});

	it('o contador de NSR não anda para trás', async () => {
		const { empresa } = await empresaComBatida();
		await expect(
			prisma.empresa.update({ where: { id: empresa.id }, data: { ultimoNsr: 0n } })
		).rejects.toThrow(/ultimo_nsr não pode diminuir/);
	});

	it('apagar a empresa é recusado (o cascade levaria o diário)', async () => {
		const { empresa } = await empresaComBatida();
		await expect(prisma.empresa.delete({ where: { id: empresa.id } })).rejects.toThrow(
			/apagaria o diário do REP/
		);
	});
});
