<!--
  @page /admin/justificativas
  @description Lista e cadastro de justificativas de falta.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { justificativaService, type Justificativa } from '@/services/justificativa.service';
	import { colaboradorService } from '@/services/colaborador.service';
	import type { Colaborador } from '@/types/colaborador';
	import Button from '@/components/ui/Button.svelte';
	import Card from '@/components/ui/Card.svelte';
	import ApprovalCard from '@/components/ApprovalCard.svelte';
	import Paginacao from '@/components/ui/Paginacao.svelte';

	type StatusVariant = 'success' | 'warning' | 'danger' | 'neutral';

	let lista = $state<Justificativa[]>([]);

	const POR_PAGINA = 20;
	let pagina = $state(1);
	const visiveis = $derived(lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA));
	let colaboradores = $state<Colaborador[]>([]);
	let errorMsg = $state('');
	let openId = $state<string | null>(null);
	let loading = $state(false);
	let previewUrl = $state<string | null>(null);
	let formularioAberto = $state(false);
	let fileInput = $state<HTMLInputElement | undefined>(undefined);
	let form = $state({
		colaboradorId: '',
		data: '',
		motivo: '',
		anexoUrl: '',
		fotoFile: null as File | null
	});

	async function carregar() {
		try {
			[lista, colaboradores] = await Promise.all([
				justificativaService.list(),
				colaboradorService.listar()
			]);
		} catch {
			errorMsg = 'Erro ao carregar dados.';
		}
	}

	const ANEXO_MIME_PERMITIDOS = ['image/png', 'image/jpeg', 'application/pdf'];

	function handleFileChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;
		if (!ANEXO_MIME_PERMITIDOS.includes(file.type)) {
			errorMsg = 'Anexo deve ser PNG, JPG ou PDF.';
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			errorMsg = 'O arquivo não pode exceder 5MB.';
			return;
		}
		form.fotoFile = file;
		errorMsg = '';
	}

	function lerComoDataUrl(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
			reader.readAsDataURL(file);
		});
	}

	async function criar(e: Event) {
		e.preventDefault();
		errorMsg = '';

		if (!form.colaboradorId || !form.data || !form.motivo) {
			errorMsg = 'Colaborador, data e motivo são obrigatórios.';
			return;
		}

		loading = true;
		try {
			let anexoUrl = form.anexoUrl;
			if (form.fotoFile) {
				anexoUrl = await lerComoDataUrl(form.fotoFile);
			}

			await justificativaService.create({
				colaboradorId: form.colaboradorId,
				data: form.data,
				motivo: form.motivo,
				anexoUrl: anexoUrl || undefined
			});
			form = { colaboradorId: '', data: '', motivo: '', anexoUrl: '', fotoFile: null };
			if (fileInput) fileInput.value = '';
			formularioAberto = false;
			await carregar();
		} catch {
			errorMsg = 'Erro ao cadastrar justificativa.';
		} finally {
			loading = false;
		}
	}

	async function remover(id: string) {
		if (!confirm('Remover esta justificativa?')) return;
		try {
			await justificativaService.remove(id);
			openId = null;
			await carregar();
		} catch {
			errorMsg = 'Erro ao remover justificativa.';
		}
	}

	async function aprovar(id: string) {
		try {
			await justificativaService.approve(id);
			await carregar();
		} catch {
			errorMsg = 'Erro ao aprovar justificativa.';
		}
	}

	async function rejeitar(id: string) {
		try {
			await justificativaService.reject(id);
			await carregar();
		} catch {
			errorMsg = 'Erro ao rejeitar justificativa.';
		}
	}

	function abrirAnexo(url: string) {
		previewUrl = url;
	}

	function fecharPreview() {
		previewUrl = null;
	}

	function fmtCurta(iso: string): string {
		return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
	}

	function fmtLonga(iso: string): string {
		return new Date(iso).toLocaleDateString('pt-BR', {
			weekday: 'long',
			day: '2-digit',
			month: 'long'
		});
	}

	function statusLabel(status: Justificativa['status']): string {
		if (status === 'pending') return 'Pendente';
		if (status === 'approved') return 'Aprovada';
		return 'Rejeitada';
	}

	function statusVariant(status: Justificativa['status']): StatusVariant {
		if (status === 'pending') return 'warning';
		if (status === 'approved') return 'success';
		return 'danger';
	}

	onMount(carregar);
</script>

<svelte:head><title>Justificativas — Admin</title></svelte:head>

<section class="admin-page">
	<header class="admin-page__header">
		<h1>Justificativas de Falta</h1>
		<Button variant="primary" onclick={() => (formularioAberto = !formularioAberto)}>
			{formularioAberto ? 'Cancelar' : 'Nova justificativa'}
		</Button>
	</header>

	{#if errorMsg}<div class="error">{errorMsg}</div>{/if}

	{#if formularioAberto}
		<div class="form-wrapper" role="region" aria-label="Formulário de nova justificativa">
			<Card>
				<h2>Nova justificativa</h2>
				<form class="form" onsubmit={criar}>
					<label class="field">
						<span>Colaborador</span>
						<select bind:value={form.colaboradorId} required disabled={loading}>
							<option value="">Selecione…</option>
							{#each colaboradores as c (c.id)}
								<option value={c.id}>{c.nome}</option>
							{/each}
						</select>
					</label>
					<label class="field">
						<span>Data da falta</span>
						<input type="date" bind:value={form.data} required disabled={loading} />
					</label>
					<label class="field">
						<span>Motivo</span>
						<input bind:value={form.motivo} required disabled={loading} />
					</label>
					<label class="field">
						<span>Anexo (PNG, JPG ou PDF, opcional)</span>
						<input
							type="file"
							accept="image/png,image/jpeg,application/pdf"
							onchange={handleFileChange}
							disabled={loading}
							bind:this={fileInput}
						/>
						{#if form.fotoFile}
							<small class="hint-success">Arquivo selecionado: {form.fotoFile.name}</small>
						{/if}
					</label>
					<div class="form-actions">
						<Button
							type="button"
							variant="secondary"
							onclick={() => (formularioAberto = false)}
							disabled={loading}
						>
							Cancelar
						</Button>
						<Button type="submit" variant="primary" disabled={loading}>
							{loading ? 'Enviando…' : 'Cadastrar'}
						</Button>
					</div>
				</form>
			</Card>
		</div>
	{/if}

	<div class="section-label">Cadastradas ({lista.length})</div>

	{#if lista.length === 0}
		<Card>
			<p class="muted">Nenhuma justificativa cadastrada.</p>
		</Card>
	{:else}
		<div class="list">
			{#each visiveis as j (j.id)}
				{@const isOpen = openId === j.id}
				<ApprovalCard
					nome={j.colaboradorNome}
					titulo="Justificativa de falta"
					dataLabel={fmtCurta(j.data)}
					badgeLabel={statusLabel(j.status)}
					badgeVariant={statusVariant(j.status)}
					expanded={isOpen}
					onToggle={() => (openId = isOpen ? null : j.id)}
				>
					{#snippet details()}
						<div class="row">
							<span class="row__label">Data</span>
							<span class="row__val">{fmtLonga(j.data)}</span>
						</div>
						<div class="row column">
							<span class="row__label">Motivo</span>
							<p class="row__motivo">{j.motivo}</p>
						</div>
						{#if j.anexoUrl}
							<div class="row">
								<span class="row__label">Anexo</span>
								{#if j.anexoUrl.startsWith('data:image/')}
									<button type="button" class="row__link" onclick={() => abrirAnexo(j.anexoUrl!)}>
										Ver foto
									</button>
								{:else}
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
									<a class="row__link" href={j.anexoUrl} target="_blank" rel="noopener">
										Ver anexo
									</a>
								{/if}
							</div>
						{/if}
					{/snippet}
					{#snippet actions()}
						{#if j.status === 'pending'}
							<Button variant="primary" onclick={() => aprovar(j.id)}>Aprovar</Button>
							<Button variant="danger" onclick={() => rejeitar(j.id)}>Rejeitar</Button>
						{:else}
							<Button variant="danger" onclick={() => remover(j.id)}>Remover</Button>
						{/if}
					{/snippet}
				</ApprovalCard>
			{/each}
		</div>

		<Paginacao bind:pagina total={lista.length} porPagina={POR_PAGINA} rotulo="justificativas" />
	{/if}
</section>

{#if previewUrl}
	<div
		class="preview-backdrop"
		role="button"
		tabindex="0"
		onclick={fecharPreview}
		onkeydown={(e) => e.key === 'Escape' && fecharPreview()}
	>
		<div
			class="preview-modal"
			role="dialog"
			aria-modal="true"
			aria-label="Visualização de anexo"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<button type="button" class="preview-close" onclick={fecharPreview}>Fechar</button>
			<img src={previewUrl} alt="Anexo da justificativa" />
		</div>
	</div>
{/if}

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

	.hint-success {
		color: #16a34a;
		font-weight: 500;
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
		text-transform: capitalize;
	}

	.row__motivo {
		margin: 0;
		color: #334155;
		font-size: 0.9rem;
		line-height: 1.5;
		background: var(--color-surface-muted);
		padding: 0.75rem;
		border-radius: var(--radius-sm);
		width: 100%;
	}

	.row__link {
		color: var(--color-primary);
		font-size: 0.875rem;
		text-decoration: none;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font-family: inherit;
	}

	.row__link:hover {
		text-decoration: underline;
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

	.preview-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.75);
		display: grid;
		place-items: center;
		padding: 1rem;
		z-index: 1000;
	}

	.preview-modal {
		width: min(96vw, 1000px);
		max-height: 92vh;
		background: #0f172a;
		border-radius: 0.75rem;
		padding: 0.75rem;
		display: grid;
		gap: 0.5rem;
	}

	.preview-modal img {
		width: 100%;
		max-height: calc(92vh - 3rem);
		object-fit: contain;
		border-radius: 0.5rem;
		background: #020617;
	}

	.preview-close {
		justify-self: end;
		border: none;
		border-radius: 0.5rem;
		padding: 0.4rem 0.7rem;
		background: #1d4ed8;
		color: #fff;
		cursor: pointer;
	}
</style>
