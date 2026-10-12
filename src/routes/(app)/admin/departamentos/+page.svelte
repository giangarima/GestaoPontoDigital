<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '@/components/ui/Button.svelte';
	import { departamentoService, type Departamento } from '@/services/departamento.service';
	import { jornadaService, type Jornada } from '@/services/jornada.service';
	import { departamentosStore } from '@/store/departamentos.store';

	let departamentos = $state<Departamento[]>([]);
	let jornadas = $state<Jornada[]>([]);
	let loading = $state(false);
	let errorMsg = $state('');
	let successMsg = $state('');

	// Modal CRUD
	let modalOpen = $state(false);
	let editingId = $state<string | null>(null);
	let formNome = $state('');
	let saving = $state(false);

	// Modal bulk jornada
	let jornadaModalOpen = $state(false);
	let bulkDepartamento = $state<Departamento | null>(null);
	let bulkJornadaId = $state<string>('');
	let bulkSaving = $state(false);

	onMount(async () => {
		loading = true;
		try {
			const [deps, jors] = await Promise.all([departamentoService.list(), jornadaService.list()]);
			departamentos = deps;
			jornadas = jors;
			departamentosStore.set(deps);
		} catch {
			errorMsg = 'Erro ao carregar departamentos.';
		} finally {
			loading = false;
		}
	});

	function openCreate() {
		editingId = null;
		formNome = '';
		modalOpen = true;
	}

	function openEdit(d: Departamento) {
		editingId = d.id;
		formNome = d.nome;
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		editingId = null;
	}

	async function handleSave() {
		if (!formNome.trim()) return;
		saving = true;
		errorMsg = '';
		try {
			if (editingId) {
				const updated = await departamentoService.update(editingId, { nome: formNome.trim() });
				departamentos = departamentos
					.map((d) => (d.id === editingId ? updated : d))
					.sort((a, b) => a.nome.localeCompare(b.nome));
				departamentosStore.update(updated.id, updated);
			} else {
				const created = await departamentoService.create({ nome: formNome.trim() });
				departamentos = [...departamentos, created].sort((a, b) => a.nome.localeCompare(b.nome));
				departamentosStore.add(created);
			}
			closeModal();
		} catch (e) {
			const err = e as { details?: { error?: string } };
			errorMsg = err.details?.error ?? 'Erro ao salvar departamento.';
		} finally {
			saving = false;
		}
	}

	async function handleDelete(id: string) {
		errorMsg = '';
		try {
			await departamentoService.remove(id);
			departamentos = departamentos.filter((d) => d.id !== id);
			departamentosStore.remove(id);
			closeModal();
		} catch {
			errorMsg = 'Erro ao excluir departamento.';
		}
	}

	function openBulkJornada(d: Departamento) {
		bulkDepartamento = d;
		bulkJornadaId = '';
		jornadaModalOpen = true;
	}

	function closeBulkJornada() {
		jornadaModalOpen = false;
		bulkDepartamento = null;
		bulkJornadaId = '';
	}

	async function handleBulkJornada() {
		if (!bulkDepartamento) return;
		bulkSaving = true;
		errorMsg = '';
		successMsg = '';
		try {
			const jornadaId = bulkJornadaId || null;
			const resultado = await departamentoService.setJornada(bulkDepartamento.id, jornadaId);
			successMsg = `Jornada aplicada a ${resultado.atualizados} colaborador(es) do departamento "${bulkDepartamento.nome}".`;
			closeBulkJornada();
		} catch {
			errorMsg = 'Erro ao aplicar jornada em massa.';
		} finally {
			bulkSaving = false;
		}
	}
</script>

<svelte:head>
	<title>Departamentos — On Time</title>
</svelte:head>

<section class="admin-page">
	<header class="admin-page__header">
		<h1>Departamentos</h1>
		<Button variant="primary" size="sm" onclick={openCreate}>Novo Departamento</Button>
	</header>

	{#if errorMsg}
		<div class="alert alert--error" role="alert">{errorMsg}</div>
	{/if}
	{#if successMsg}
		<div class="alert alert--success" role="status">{successMsg}</div>
	{/if}

	{#if loading}
		<p class="empty">Carregando...</p>
	{:else if departamentos.length === 0}
		<p class="empty">Nenhum departamento cadastrado.</p>
	{:else}
		<div class="grid">
			{#each departamentos as d (d.id)}
				<div class="card">
					<div class="card__nome">{d.nome}</div>
					<div class="card__actions">
						<Button variant="outline" size="sm" onclick={() => openEdit(d)}>Editar</Button>
						<Button variant="primary" size="sm" onclick={() => openBulkJornada(d)}>
							Alterar jornada
						</Button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>

<!-- Modal CRUD -->
{#if modalOpen}
	<div class="modal-backdrop" role="dialog" aria-modal="true">
		<div class="modal">
			<div class="modal__header">
				<h2 class="modal__title">{editingId ? 'Editar Departamento' : 'Novo Departamento'}</h2>
				<button type="button" class="modal__close" onclick={closeModal} aria-label="Fechar"
					>&times;</button
				>
			</div>

			<form
				class="modal__body"
				onsubmit={(e) => {
					e.preventDefault();
					handleSave();
				}}
			>
				<div class="field">
					<label for="nome">Nome do Departamento</label>
					<input
						id="nome"
						type="text"
						bind:value={formNome}
						placeholder="Ex: Tecnologia"
						required
					/>
				</div>

				<div class="modal__footer">
					{#if editingId}
						<Button variant="danger" onclick={() => handleDelete(editingId!)}>Excluir</Button>
					{/if}
					<div class="modal__footer-spacer"></div>
					<Button variant="outline" onclick={closeModal}>Cancelar</Button>
					<Button variant="primary" type="submit" loading={saving}>
						{editingId ? 'Salvar' : 'Criar'}
					</Button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Modal Bulk Jornada -->
{#if jornadaModalOpen && bulkDepartamento}
	<div class="modal-backdrop" role="dialog" aria-modal="true">
		<div class="modal">
			<div class="modal__header">
				<h2 class="modal__title">Alterar jornada em massa</h2>
				<button type="button" class="modal__close" onclick={closeBulkJornada} aria-label="Fechar"
					>&times;</button
				>
			</div>

			<form
				class="modal__body"
				onsubmit={(e) => {
					e.preventDefault();
					handleBulkJornada();
				}}
			>
				<p class="hint">
					Aplica a jornada selecionada a <strong>todos os colaboradores</strong> do departamento
					<strong>"{bulkDepartamento.nome}"</strong>.
				</p>

				<div class="field">
					<label for="bulk-jornada">Jornada</label>
					{#if jornadas.length === 0}
						<p class="hint">
							Nenhuma jornada cadastrada. Cadastre uma em <strong>Jornadas</strong> antes.
						</p>
					{:else}
						<select id="bulk-jornada" bind:value={bulkJornadaId}>
							<option value="">Sem jornada (desvincular)</option>
							{#each jornadas as j (j.id)}
								<option value={j.id}>{j.nome}</option>
							{/each}
						</select>
					{/if}
				</div>

				<div class="modal__footer">
					<div class="modal__footer-spacer"></div>
					<Button variant="outline" onclick={closeBulkJornada}>Cancelar</Button>
					<Button variant="primary" type="submit" loading={bulkSaving}>Aplicar</Button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.alert {
		padding: 0.75rem 1rem;
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
	}

	.alert--error {
		background: var(--color-danger-bg);
		color: var(--color-danger);
	}

	.alert--success {
		background: var(--color-success-bg);
		color: var(--color-success-strong);
	}

	.empty {
		text-align: center;
		color: var(--color-text-subtle);
		padding: 4rem 2rem;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
	}

	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 1.25rem;
		box-shadow: var(--shadow-card);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.card__nome {
		font-weight: 700;
		color: var(--color-text);
		font-size: 1rem;
	}

	.card__actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: var(--color-overlay);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
		padding: 1rem;
	}

	.modal {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		width: 100%;
		max-width: 480px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
	}

	.modal__header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.modal__title {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--color-text);
	}

	.modal__close {
		background: none;
		border: none;
		font-size: 1.5rem;
		line-height: 1;
		color: var(--color-text-muted);
		cursor: pointer;
		padding: 0.25rem;
	}

	.modal__body {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.modal__footer {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-top: 1rem;
		border-top: 1px solid var(--color-border);
	}

	.modal__footer-spacer {
		flex: 1;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.field label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.field input,
	.field select {
		border: 1.5px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		padding: 0.5rem 0.75rem;
		font-size: 0.9rem;
		outline: none;
		background: var(--color-surface);
		color: var(--color-text);
	}

	.field input:focus,
	.field select:focus {
		border-color: var(--color-primary);
	}

	.hint {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0;
	}
</style>
