import { describe, expect, it } from 'vitest';
import { lerDadosBootstrap } from './bootstrap';

const valido = {
	EMPRESA_NOME: 'Loja Centro',
	EMPRESA_CNPJ: '11.222.333/0001-81',
	ADMIN_NOME: 'Fulana de Tal',
	ADMIN_EMAIL: ' Fulana@Loja.com ',
	ADMIN_CPF: '529.982.247-25',
	ADMIN_SENHA: 'Segura123'
};

describe('lerDadosBootstrap', () => {
	it('normaliza CNPJ, CPF e e-mail e aplica os horários padrão', () => {
		expect(lerDadosBootstrap(valido)).toEqual({
			empresaNome: 'Loja Centro',
			empresaCnpj: '11222333000181',
			horaAbertura: '08:00',
			horaFechamento: '18:00',
			adminNome: 'Fulana de Tal',
			adminEmail: 'fulana@loja.com',
			adminCpf: '52998224725',
			adminSenha: 'Segura123'
		});
	});

	it('CNPJ é opcional', () => {
		expect(lerDadosBootstrap({ ...valido, EMPRESA_CNPJ: '' }).empresaCnpj).toBeNull();
	});

	it('junta todos os problemas numa mensagem só', () => {
		const erro = (() => {
			try {
				lerDadosBootstrap({
					ADMIN_CPF: '111.111.111-11',
					ADMIN_SENHA: 'fraca',
					HORA_ABERTURA: '8h'
				});
			} catch (e) {
				return (e as Error).message;
			}
		})();
		expect(erro).toContain('EMPRESA_NOME é obrigatório');
		expect(erro).toContain('ADMIN_EMAIL inválido');
		expect(erro).toContain('ADMIN_CPF inválido');
		expect(erro).toContain('ADMIN_SENHA');
		expect(erro).toContain('HORA_ABERTURA');
	});
});
