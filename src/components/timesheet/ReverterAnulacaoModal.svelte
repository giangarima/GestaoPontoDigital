<!--
  @component ReverterAnulacaoModal
  @description Confirmação para reverter uma anulação avulsa de batida.

  Conformidade Portaria 671: a batida original nunca foi tocada — reverter
  arquiva a marca de tratamento (RegistroAnulacao → RegistroAnulacaoRevertida)
  e a batida volta a contar no espelho. Aplica-se só a anulações avulsas (sem substituta).
-->
<script lang="ts">
	import type { RegistroRecord } from '@/services/timesheet.service';

	interface Props {
		aberto: boolean;
		registro: RegistroRecord | null;
		onFechar: () => void;
		onReverter: () => Promise<void>;
	}

	let { aberto, registro, onFechar, onReverter }: Props = $props();

	const TIPO_LABEL: Record<string, string> = {
		entrada: 'Entrada',
		saida_almoco: 'Saída para almoço',
		retorno_almoco: 'Retorno do almoço',
		saida: 'Saída'
	};

	let revertendo = $state(false);
	let erro = $state('');

	$effect(() => {
		if (aberto) erro = '';
	});

	async function handleReverter() {
		revertendo = true;
		erro = '';
		try {
			await onReverter();
		} catch {
			erro = 'Falha ao reverter anulação. Tente novamente.';
		} finally {
			revertendo = false;
		}
	}

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget && !revertendo) onFechar();
	}
</script>

{#if aberto && registro}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={handleBackdrop}>
		<div class="modal" role="dialog" aria-modal="true" aria-labelledby="reverter-titulo">
			<form onsubmit={(e) => e.preventDefault()}>
				<header class="modal-header">
					<h2 id="reverter-titulo">Reverter anulação</h2>
					<button type="button" class="btn-fechar" onclick={onFechar} aria-label="Fechar">✕</button>
				</header>

				<div class="modal-body">
					<p class="aviso">
						A batida volta a contar no espelho. A marcação original nunca foi alterada, e a anulação
						revertida fica guardada no histórico do diário.
					</p>

					<dl class="info">
						<div>
							<dt>Batida</dt>
							<dd>
								{TIPO_LABEL[registro.type] ?? registro.type} —
								{new Date(registro.timestamp).toLocaleString('pt-BR')}
							</dd>
						</div>
						{#if registro.anulacao}
							<div>
								<dt>Motivo</dt>
								<dd>{registro.anulacao.motivo}</dd>
							</div>
						{/if}
					</dl>

					{#if erro}<div class="erro" role="alert">{erro}</div>{/if}
				</div>

				<footer class="modal-footer">
					<button
						type="button"
						class="btn btn--secundario"
						onclick={onFechar}
						disabled={revertendo}
					>
						Cancelar
					</button>
					<button
						type="button"
						class="btn btn--primario"
						onclick={handleReverter}
						disabled={revertendo}
					>
						{revertendo ? 'Revertendo...' : 'Reverter anulação'}
					</button>
				</footer>
			</form>
		</div>
	</div>
{/if}

<style>
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
		border-radius: 0.75rem;
		width: 100%;
		max-width: 460px;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
	}
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.25rem 1.5rem 0;
	}
	.modal-header h2 {
		margin: 0;
		font-size: 1.15rem;
	}
	.btn-fechar {
		background: none;
		border: none;
		font-size: 1.125rem;
		color: var(--color-text-muted);
		cursor: pointer;
		padding: 0.25rem;
	}
	.modal-body {
		padding: 1.25rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.aviso {
		font-size: 0.825rem;
		color: var(--color-text-muted);
		background: var(--color-primary-soft);
		border-left: 3px solid var(--color-primary);
		padding: 0.625rem 0.75rem;
		border-radius: 0.375rem;
		margin: 0;
		line-height: 1.4;
	}
	.info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		background: var(--color-surface-muted);
		padding: 0.75rem;
		border-radius: 0.5rem;
		margin: 0;
		font-size: 0.875rem;
	}
	.info > div {
		display: flex;
		gap: 0.5rem;
	}
	.info dt {
		color: var(--color-text-muted);
		min-width: 60px;
		margin: 0;
	}
	.info dd {
		margin: 0;
		color: var(--color-text);
		font-weight: 500;
	}
	.erro {
		background: var(--color-danger-bg);
		color: var(--color-danger-strong);
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.825rem;
	}
	.modal-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75rem;
		padding: 0.75rem 1.5rem 1.25rem;
		border-top: 1px solid var(--color-border);
	}
	.btn {
		padding: 0.5rem 1.125rem;
		border-radius: 0.5rem;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		border: none;
	}
	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.btn--primario {
		background: var(--color-primary);
		color: var(--color-on-primary);
	}
	.btn--secundario {
		background: var(--color-border);
		color: var(--color-text);
	}
</style>
