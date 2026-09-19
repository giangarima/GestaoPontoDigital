/**
 * Trava de segurança: os testes apagam e recriam o schema do banco. Só aceita
 * host local, para nunca tocar no Neon de produção por engano.
 */
export function assertBancoLocal(url: string | undefined): void {
	const host = url ? new URL(url).hostname : '';
	if (host !== 'localhost' && host !== '127.0.0.1') {
		throw new Error(`Testes de banco recusados: DATABASE_URL não é local (host "${host}").`);
	}
}
