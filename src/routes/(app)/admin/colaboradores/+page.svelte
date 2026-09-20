<!-- src/routes/(app)/admin/colaboradores/+page.svelte -->

<script lang="ts">
	import { onMount } from 'svelte';
	import { colaboradoresStore } from '@/store/colaboradores.store';
	import { colaboradorService } from '@/services/colaborador.service';
	import ColaboradorModal from '@/components/colaboradores/ColaboradorModal.svelte';
	import ConfirmarExclusao from '@/components/colaboradores/ConfirmarExclusao.svelte';
	import type { Colaborador, ColaboradorFormData, StatusColaborador } from '@/types/colaborador';
	import Button from '@/components/ui/Button.svelte';
	import Paginacao from '@/components/ui/Paginacao.svelte';

	// ── Estado da UI ──────────────────────────────────────────────────────────
	let carregando = $state(true);
	let erro = $state<string | null>(null);
	let busca = $state('');
	let filtroStatus = $state<StatusColaborador | 'todos'>('todos');

	// Modal de criação/edição
	let modalAberto = $state(false);
	let colaboradorEditando = $state<Colaborador | null>(null);

	// Modal de exclusão
	let exclusaoAberta = $state(false);
	let colaboradorParaExcluir = $state<Colaborador | null>(null);

	// ── Dados derivados ───────────────────────────────────────────────────────
	const colaboradoresFiltrados = $derived(() => {
		const termo = busca.toLowerCase();
		return $colaboradoresStore.filter((c) => {
			const matchBusca =
				!termo ||
				c.nome.toLowerCase().includes(termo) ||
				c.email.toLowerCase().includes(termo) ||
				c.cargo.toLowerCase().includes(termo) ||
				(c.departamento?.nome.toLowerCase().includes(termo) ?? false);

			const matchStatus = filtroStatus === 'todos' || c.status === filtroStatus;

			return matchBusca && matchStatus;
		});
	});

	const POR_PAGINA = 20;
	let pagina = $state(1);
	const visiveis = $derived(
		colaboradoresFiltrados().slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
	);

	// Busca e filtro encurtam a lista: a página corrente deixaria de fazer
	// sentido, então volta para a primeira sempre que o recorte muda. Guardar o
	// recorte anterior evita voltar à página 1 quando só a lista foi recarregada.
	let recorteAnterior = '';
	$effect(() => {
		const recorte = `${busca}|${filtroStatus}`;
		if (recorte === recorteAnterior) return;
		recorteAnterior = recorte;
		pagina = 1;
	});

	// ── Carregamento inicial ──────────────────────────────────────────────────
	onMount(async () => {
		try {
			const lista = await colaboradorService.listar();
			colaboradoresStore.set(lista);
		} catch {
			erro = 'Não foi possível carregar os colaboradores.';
		} finally {
			carregando = false;
		}
	});

	// ── Ações CRUD ────────────────────────────────────────────────────────────
	function abrirCriacao() {
		colaboradorEditando = null;
		modalAberto = true;
	}

	function abrirEdicao(colaborador: Colaborador) {
		colaboradorEditando = colaborador;
		modalAberto = true;
	}

	function fecharModal() {
		modalAberto = false;
		colaboradorEditando = null;
	}

	// Erros são propagados (throw) para o ColaboradorModal exibir inline/por campo.
	async function handleSalvar(dados: ColaboradorFormData) {
		if (colaboradorEditando) {
			const atualizado = await colaboradorService.atualizar(colaboradorEditando.id, dados);
			colaboradoresStore.update(colaboradorEditando.id, atualizado);
		} else {
			const novo = await colaboradorService.criar(dados);
			colaboradoresStore.add(novo);
		}
		fecharModal();
	}

	function abrirExclusao(colaborador: Colaborador) {
		colaboradorParaExcluir = colaborador;
		exclusaoAberta = true;
	}

	async function confirmarExclusao() {
		if (!colaboradorParaExcluir) return;
		try {
			await colaboradorService.remover(colaboradorParaExcluir.id);
			colaboradoresStore.remove(colaboradorParaExcluir.id);
		} catch (e) {
			const err = e as { details?: { error?: string } };
			erro = err.details?.error ?? 'Erro ao remover colaborador.';
		} finally {
			exclusaoAberta = false;
			colaboradorParaExcluir = null;
		}
	}

	// ── Helpers de apresentação ───────────────────────────────────────────────
	const statusConfig: Record<StatusColaborador, { label: string; classe: string }> = {
		ativo: { label: 'Ativo', classe: 'badge--ativo' },
		inativo: { label: 'Inativo', classe: 'badge--inativo' },
		ferias: { label: 'Férias', classe: 'badge--ferias' },
		afastado: { label: 'Afastado', classe: 'badge--afastado' }
	};

	function formatarData(iso: string) {
		return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR');
	}

	function iniciais(nome: string) {
		return nome
			.split(' ')
			.slice(0, 2)
			.map((p) => p[0])
			.join('')
			.toUpperCase();
	}
</script>

<svelte:head>
	<title>Colaboradores — Admin</title>
</svelte:head>

<section class="admin-page">
	<!-- Cabeçalho da página -->
	<header class="admin-page__header">
		<div>
			<h1>Colaboradores</h1>
			<p class="page-subtitulo">
				{$colaboradoresStore.length} colaborador{$colaboradoresStore.length !== 1 ? 'es' : ''} cadastrado{$colaboradoresStore.length !==
				1
					? 's'
					: ''}
			</p>
		</div>
		<Button onclick={abrirCriacao}>Novo colaborador</Button>
	</header>

	<!-- Barra de filtros -->
	<div class="filtros">
		<input
			class="input-busca"
			type="search"
			placeholder="Buscar por nome, e-mail, cargo…"
			bind:value={busca}
		/>

		<select class="select-status" bind:value={filtroStatus}>
			<option value="todos">Todos os status</option>
			<option value="ativo">Ativo</option>
			<option value="inativo">Inativo</option>
			<option value="ferias">Férias</option>
			<option value="afastado">Afastado</option>
		</select>
	</div>

	<!-- Mensagem de erro -->
	{#if erro}
		<div class="alerta alerta--erro" role="alert">
			{erro}
			<button onclick={() => (erro = null)} aria-label="Fechar aviso">✕</button>
		</div>
	{/if}

	<!-- Estado de carregamento -->
	{#if carregando}
		<div class="estado-vazio">
			<span class="spinner" aria-label="Carregando"></span>
			<p>Carregando colaboradores…</p>
		</div>

		<!-- Lista vazia -->
	{:else if colaboradoresFiltrados().length === 0}
		<div class="estado-vazio">
			<span class="icone-vazio">👥</span>
			<p>
				{busca || filtroStatus !== 'todos'
					? 'Nenhum colaborador encontrado para os filtros aplicados.'
					: 'Nenhum colaborador cadastrado ainda.'}
			</p>
			{#if !busca && filtroStatus === 'todos'}
				<button class="btn btn--primario" onclick={abrirCriacao}
					>Cadastrar primeiro colaborador</button
				>
			{/if}
		</div>

		<!-- Tabela de colaboradores -->
	{:else}
		<div class="tabela-wrapper">
			<table class="tabela">
				<thead>
					<tr>
						<th>Colaborador</th>
						<th>Cargo / Departamento</th>
						<th>Admissão</th>
						<th>Status</th>
						<th class="th-acoes">Ações</th>
					</tr>
				</thead>
				<tbody>
					{#each visiveis as colaborador (colaborador.id)}
						<tr>
							<td>
								<div class="colaborador-info">
									<div class="avatar" aria-hidden="true">{iniciais(colaborador.nome)}</div>
									<div>
										<span class="colaborador-nome">{colaborador.nome}</span>
										<span class="colaborador-email">{colaborador.email}</span>
									</div>
								</div>
							</td>
							<td>
								<span class="colaborador-cargo">{colaborador.cargo}</span>
								<span class="colaborador-depto">{colaborador.departamento?.nome ?? '—'}</span>
							</td>
							<td class="td-data">{formatarData(colaborador.dataAdmissao)}</td>
							<td>
								<span class="badge {statusConfig[colaborador.status].classe}">
									{statusConfig[colaborador.status].label}
								</span>
							</td>
							<td class="td-acoes">
								<Button variant="outline" size="sm" onclick={() => abrirEdicao(colaborador)}>
									Editar
								</Button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<Paginacao
			bind:pagina
			total={colaboradoresFiltrados().length}
			porPagina={POR_PAGINA}
			rotulo="colaboradores"
		/>
	{/if}
</section>

<!-- Modais -->
<ColaboradorModal
	aberto={modalAberto}
	colaborador={colaboradorEditando}
	onFechar={fecharModal}
	onSalvar={handleSalvar}
	onExcluir={() => {
		if (!colaboradorEditando) return;
		const alvo = colaboradorEditando;
		fecharModal();
		abrirExclusao(alvo);
	}}
/>

<ConfirmarExclusao
	aberto={exclusaoAberta}
	nome={colaboradorParaExcluir?.nome ?? ''}
	onConfirmar={confirmarExclusao}
	onCancelar={() => {
		exclusaoAberta = false;
		colaboradorParaExcluir = null;
	}}
/>

<style>
	.page-subtitulo {
		font-size: 0.875rem;
		color: var(--color-text-muted, #666);
		margin: 0.25rem 0 0;
	}

	/* ── Filtros ── */
	.filtros {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
		flex-wrap: wrap;
	}

	.input-busca {
		flex: 1;
		min-width: 200px;
		padding: 0.625rem 0.875rem;
		border: 1.5px solid var(--color-border, #e2e8f0);
		border-radius: var(--radius-sm);
		font-size: 0.9rem;
		background: var(--color-input-bg, #f8fafc);
		color: var(--color-text, #111);
		outline: none;
		transition: border-color 0.15s;
	}

	.input-busca:focus {
		border-color: var(--color-primary, #3b82f6);
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.select-status {
		padding: 0.625rem 0.875rem;
		border: 1.5px solid var(--color-border, #e2e8f0);
		border-radius: var(--radius-sm);
		font-size: 0.9rem;
		background: var(--color-input-bg, #f8fafc);
		color: var(--color-text, #111);
		cursor: pointer;
		outline: none;
	}

	/* ── Alerta ── */
	.alerta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}

	.alerta--erro {
		background: var(--color-danger-bg);
		color: var(--color-danger);
		border: 1px solid #fecaca;
	}

	.alerta button {
		background: none;
		border: none;
		cursor: pointer;
		color: inherit;
		padding: 0;
		font-size: 1rem;
		line-height: 1;
	}

	/* ── Estado vazio / carregamento ── */
	.estado-vazio {
		text-align: center;
		padding: 4rem 1rem;
		color: var(--color-text-muted, #666);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.icone-vazio {
		font-size: 3rem;
	}

	.spinner {
		display: inline-block;
		width: 2.5rem;
		height: 2.5rem;
		border: 3px solid var(--color-border, #e2e8f0);
		border-top-color: var(--color-primary, #3b82f6);
		border-radius: 50%;
		animation: girar 0.7s linear infinite;
	}

	@keyframes girar {
		to {
			transform: rotate(360deg);
		}
	}

	/* ── Tabela ── */
	.tabela-wrapper {
		overflow-x: auto;
		border: 1px solid var(--color-border, #e2e8f0);
		border-radius: var(--radius-md);
	}

	.tabela {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	.tabela thead {
		background: var(--color-surface-alt, #f8fafc);
	}

	.tabela th {
		padding: 0.875rem 1rem;
		text-align: left;
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted, #666);
		border-bottom: 1px solid var(--color-border, #e2e8f0);
	}

	.th-acoes {
		text-align: right;
	}

	.tabela td {
		padding: 1rem;
		border-bottom: 1px solid var(--color-border, #e2e8f0);
		vertical-align: middle;
	}

	.tabela tbody tr:last-child td {
		border-bottom: none;
	}

	.tabela tbody tr:hover {
		background: var(--color-surface-alt, #f8fafc);
	}

	/* ── Célula de colaborador ── */
	.colaborador-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.avatar {
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 50%;
		background: var(--color-primary, #3b82f6);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8rem;
		font-weight: 700;
		flex-shrink: 0;
	}

	.colaborador-nome {
		display: block;
		font-weight: 500;
		color: var(--color-text, #111);
	}

	.colaborador-email {
		display: block;
		font-size: 0.8rem;
		color: var(--color-text-muted, #666);
	}

	.colaborador-cargo {
		display: block;
		color: var(--color-text, #111);
	}

	.colaborador-depto {
		display: block;
		font-size: 0.8rem;
		color: var(--color-text-muted, #666);
	}

	.td-data {
		white-space: nowrap;
		color: var(--color-text-muted, #666);
	}

	/* ── Badges de status ── */
	.badge {
		display: inline-block;
		padding: 0.25rem 0.625rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.badge--ativo {
		background: #dcfce7;
		color: #166534;
	}
	.badge--inativo {
		background: var(--color-bg);
		color: #475569;
	}
	.badge--ferias {
		background: #dbeafe;
		color: #1d4ed8;
	}
	.badge--afastado {
		background: #fef9c3;
		color: #854d0e;
	}

	/* ── Ações ── */
	.td-acoes {
		text-align: right;
		white-space: nowrap;
	}

	.btn-acao {
		background: none;
		border: none;
		padding: 0.4rem;
		cursor: pointer;
		border-radius: 0.375rem;
		font-size: 1rem;
		transition: background 0.15s;
	}

	.btn-acao:hover {
		background: var(--color-border, #e2e8f0);
	}

	/* ── Botão primário ── */
	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.625rem 1.25rem;
		border-radius: var(--radius-sm);
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		border: none;
		transition: opacity 0.15s;
	}

	.btn--primario {
		background: var(--color-primary, #3b82f6);
		color: #fff;
	}

	.btn--primario:hover {
		opacity: 0.9;
	}
</style>
