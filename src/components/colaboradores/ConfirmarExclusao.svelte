<!-- src/components/colaboradores/ConfirmarExclusao.svelte -->
<script lang="ts">
	interface Props {
		aberto: boolean;
		nome: string;
		onConfirmar: () => void;
		onCancelar: () => void;
	}

	let { aberto, nome, onConfirmar, onCancelar }: Props = $props();

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onCancelar();
	}
</script>

{#if aberto}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="backdrop" onclick={handleBackdropClick}>
		<div class="dialog" role="alertdialog" aria-modal="true">
			<div class="icone">⚠️</div>
			<h3>Remover colaborador</h3>
			<p>
				Tem certeza que deseja remover <strong>{nome}</strong>? Esta ação não pode ser desfeita.
			</p>
			<div class="acoes">
				<button class="btn btn--cancelar" onclick={onCancelar}>Cancelar</button>
				<button class="btn btn--confirmar" onclick={onConfirmar}>Sim, remover</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: var(--color-overlay);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 60;
		padding: 1rem;
	}

	.dialog {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		padding: 2rem;
		text-align: center;
		max-width: 400px;
		width: 100%;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
	}

	.icone {
		font-size: 2.5rem;
		margin-bottom: 1rem;
	}

	h3 {
		font-size: 1.125rem;
		font-weight: 600;
		margin: 0 0 0.5rem;
		color: var(--color-text);
	}

	p {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		margin: 0 0 1.5rem;
		line-height: 1.5;
	}

	.acoes {
		display: flex;
		gap: 0.75rem;
		justify-content: center;
	}

	.btn {
		padding: 0.625rem 1.5rem;
		border-radius: 0.5rem;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		border: none;
		transition: opacity 0.15s;
	}

	.btn:hover {
		opacity: 0.85;
	}

	.btn--cancelar {
		background: var(--color-border);
		color: var(--color-text);
	}

	.btn--confirmar {
		background: var(--color-danger);
		color: var(--color-on-primary);
	}
</style>
