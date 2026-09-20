<!--
  @page /admin/ferias
  @description Lista e cadastro de períodos de férias.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { feriasService, type Ferias } from '@/services/ferias.service';
	import { colaboradorService } from '@/services/colaborador.service';
	import type { Colaborador } from '@/types/colaborador';
	import Button from '@/components/ui/Button.svelte';
	import Card from '@/components/ui/Card.svelte';
	import ApprovalCard from '@/components/ApprovalCard.svelte';
	import Paginacao from '@/components/ui/Paginacao.svelte';

	let lista = $state<Ferias[]>([]);

	const POR_PAGINA = 20;
	let pagina = $state(1);
	const visiveis = $derived(lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA));
	let colaboradores = $state<Colaborador[]>([]);
	let errorMsg = $state('');
	let openId = $state<string | null>(null);
	let formularioAberto = $state(false);
	let form = $state({ colaboradorId: '', dataInicio: '', dataFim: '', observacao: '' });

	async function carregar() {
		try {
			[lista, colaboradores] = await Promise.all([
				feriasService.list(),
				colaboradorService.listar()
			]);
		} catch {
			errorMsg = 'Erro ao carregar dados.';
		}
	}

	async function criar(e: Event) {
		e.preventDefault();
		try {
			await feriasService.create({
				colaboradorId: form.colaboradorId,
				dataInicio: form.dataInicio,
				dataFim: form.dataFim,
				observacao: form.observacao || undefined
			});
			form = { colaboradorId: '', dataInicio: '', dataFim: '', observacao: '' };
			formularioAberto = false;
			await carregar();
		} catch {
			errorMsg = 'Erro ao cadastrar férias.';
		}
	}

	async function remover(id: string) {
		if (!confirm('Remover este período?')) return;
		await feriasService.remove(id);
		openId = null;
		await carregar();
	}

	function fmtCurta(iso: string): string {
		return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
	}

	function fmtLonga(iso: string): string {
		return new Date(iso).toLocaleDateString('pt-BR', {
			day: '2-digit',
			month: 'long',
			year: 'numeric'
		});
	}

	function periodoLabel(f: Ferias): string {
		return `${fmtCurta(f.dataInicio)} → ${fmtCurta(f.dataFim)}`;
	}

	onMount(carregar);
</script>

<svelte:head><title>Férias — Admin</title></svelte:head>

<section class="admin-page">
	<header class="admin-page__header">
		<h1>Férias</h1>
		<Button variant="primary" onclick={() => (formularioAberto = !formularioAberto)}>
			{formularioAberto ? 'Cancelar' : 'Novo período'}
		</Button>
	</header>

	{#if errorMsg}<div class="error">{errorMsg}</div>{/if}

	{#if formularioAberto}
		<div class="form-wrapper" role="region" aria-label="Formulário de novo período de férias">
			<Card>
				<h2>Novo período</h2>
				<form class="form" onsubmit={criar}>
					<label class="field">
						<span>Colaborador</span>
						<select bind:value={form.colaboradorId} required>
							<option value="">Selecione…</option>
							{#each colaboradores as c (c.id)}
								<option value={c.id}>{c.nome}</option>
							{/each}
						</select>
					</label>
					<div class="row-2">
						<label class="field">
							<span>Início</span>
							<input type="date" bind:value={form.dataInicio} required />
						</label>
						<label class="field">
							<span>Fim</span>
							<input type="date" bind:value={form.dataFim} required />
						</label>
					</div>
					<label class="field">
						<span>Observação</span>
						<input bind:value={form.observacao} />
					</label>
					<div class="form-actions">
						<Button type="button" variant="secondary" onclick={() => (formularioAberto = false)}>
							Cancelar
						</Button>
						<Button type="submit" variant="primary">Cadastrar</Button>
					</div>
				</form>
			</Card>
		</div>
	{/if}

	<div class="section-label">Cadastradas ({lista.length})</div>

	{#if lista.length === 0}
		<Card>
			<p class="muted">Nenhum período de férias cadastrado.</p>
		</Card>
	{:else}
		<div class="list">
			{#each visiveis as f (f.id)}
				{@const isOpen = openId === f.id}
				<ApprovalCard
					nome={f.colaboradorNome}
					titulo="Férias"
					dataLabel={periodoLabel(f)}
					expanded={isOpen}
					onToggle={() => (openId = isOpen ? null : f.id)}
				>
					{#snippet details()}
						<div class="row">
							<span class="row__label">Início</span>
							<span class="row__val">{fmtLonga(f.dataInicio)}</span>
						</div>
						<div class="row">
							<span class="row__label">Fim</span>
							<span class="row__val">{fmtLonga(f.dataFim)}</span>
						</div>
						{#if f.observacao}
							<div class="row column">
								<span class="row__label">Observação</span>
								<p class="row__obs">{f.observacao}</p>
							</div>
						{/if}
					{/snippet}
					{#snippet actions()}
						<Button variant="danger" onclick={() => remover(f.id)}>Remover</Button>
					{/snippet}
				</ApprovalCard>
			{/each}
		</div>

		<Paginacao bind:pagina total={lista.length} porPagina={POR_PAGINA} rotulo="períodos" />
	{/if}
</section>

<style>
	.form-wrapper {
		animation: slideDown 0.2s ease;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: #374151;
	}

	.field input,
	.field select {
		padding: 0.625rem 0.875rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.9375rem;
		color: var(--color-text);
		font-family: inherit;
	}

	.row-2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.section-label {
		font-size: 0.8125rem;
		font-weight: 700;
		color: var(--color-text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}

	.row.column {
		flex-direction: column;
		align-items: flex-start;
	}

	.row__label {
		font-size: 0.8125rem;
		color: var(--color-text-subtle);
		font-weight: 500;
	}

	.row__val {
		font-size: 0.875rem;
		color: var(--color-text);
		font-weight: 500;
	}

	.row__obs {
		margin: 0;
		color: #334155;
		font-size: 0.9rem;
		line-height: 1.5;
		background: var(--color-surface-muted);
		padding: 0.75rem;
		border-radius: var(--radius-sm);
		width: 100%;
	}

	.muted {
		color: var(--color-text-muted);
		margin: 0;
	}

	.error {
		background: var(--color-danger-bg);
		color: var(--color-danger);
		padding: 0.75rem 1rem;
		border-radius: var(--radius-sm);
	}
</style>
