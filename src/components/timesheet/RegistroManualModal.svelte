<!--
  @component RegistroManualModal
  @description Modal para admin registrar batida retroativa de um colaborador.
  Conformidade Portaria 671: cria registro novo (não altera nenhum existente).
-->
<script lang="ts">
	import type { RegistroType } from '@/services/timesheet.service';

	interface Props {
		aberto: boolean;
		/** Nome do colaborador para quem a batida será registrada (exibido no cabeçalho). */
		colaboradorNome?: string;
		/** Data inicial do datetime-local (YYYY-MM-DDTHH:mm) */
		dataInicial: string;
		tipoInicial: RegistroType;
		onFechar: () => void;
		onConfirmar: (dados: {
			type: RegistroType;
			timestamp: string;
			reason: string;
		}) => Promise<void>;
	}

	let { aberto, colaboradorNome, dataInicial, tipoInicial, onFechar, onConfirmar }: Props =
		$props();

	let tipo = $state<RegistroType>('entrada');
	let dataHora = $state('');
	let motivo = $state('');
	let salvando = $state(false);
	let erro = $state('');

	$effect(() => {
		if (aberto) {
			tipo = tipoInicial;
			dataHora = dataInicial;
			motivo = '';
			erro = '';
		}
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		erro = '';

		if (motivo.trim().length < 5) {
			erro = 'Informe um motivo com ao menos 5 caracteres.';
			return;
		}
		if (!dataHora) {
			erro = 'Informe data e hora.';
			return;
		}

		const ts = new Date(dataHora);
		if (isNaN(ts.getTime())) {
			erro = 'Data/hora inválida.';
			return;
		}
		if (ts.getTime() > Date.now()) {
			erro = 'Não é possível registrar ponto em data futura.';
			return;
		}

		salvando = true;
		try {
			await onConfirmar({ type: tipo, timestamp: ts.toISOString(), reason: motivo.trim() });
		} catch {
			erro = 'Falha ao registrar marcação. Tente novamente.';
		} finally {
			salvando = false;
		}
	}

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget && !salvando) onFechar();
	}
</script>

{#if aberto}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={handleBackdrop}>
		<div class="modal" role="dialog" aria-modal="true" aria-labelledby="registro-manual-titulo">
			<form onsubmit={handleSubmit}>
				<header class="modal-header">
					<h2 id="registro-manual-titulo">
						Registrar ponto manual{colaboradorNome ? ` — ${colaboradorNome}` : ''}
					</h2>
					<button type="button" class="btn-fechar" onclick={onFechar} aria-label="Fechar">✕</button>
				</header>

				<div class="modal-body">
					<div class="campo">
						<label for="tipo">Tipo de registro</label>
						<select id="tipo" bind:value={tipo}>
							<option value="entrada">Entrada</option>
							<option value="saida_almoco">Saída para almoço</option>
							<option value="retorno_almoco">Retorno do almoço</option>
							<option value="saida">Saída</option>
						</select>
					</div>

					<div class="campo">
						<label for="dataHora">Data e hora</label>
						<input id="dataHora" type="datetime-local" bind:value={dataHora} required />
					</div>

					<div class="campo">
						<label for="motivo">Motivo *</label>
						<textarea
							id="motivo"
							bind:value={motivo}
							rows="3"
							placeholder="Ex.: Colaborador esqueceu de marcar ponto na entrada — confirmado pelo gestor."
							required
						></textarea>
					</div>

					{#if erro}<div class="erro" role="alert">{erro}</div>{/if}
				</div>

				<footer class="modal-footer">
					<button type="button" class="btn btn--secundario" onclick={onFechar} disabled={salvando}>
						Cancelar
					</button>
					<button type="submit" class="btn btn--primario" disabled={salvando}>
						{salvando ? 'Salvando...' : 'Registrar ponto'}
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
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
		padding: 1rem;
	}
	.modal {
		background: #fff;
		border-radius: 0.75rem;
		width: 100%;
		max-width: 520px;
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
		color: #64748b;
		cursor: pointer;
		padding: 0.25rem;
	}
	.modal-body {
		padding: 1.25rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.campo {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	label {
		font-size: 0.875rem;
		font-weight: 500;
		color: #111;
	}
	input,
	select,
	textarea {
		padding: 0.5rem 0.75rem;
		border: 1.5px solid #e2e8f0;
		border-radius: 0.5rem;
		font-size: 0.9rem;
		background: #f8fafc;
		font-family: inherit;
	}
	input:focus,
	select:focus,
	textarea:focus {
		outline: none;
		border-color: #3b82f6;
		background: #fff;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}
	.erro {
		background: #fef2f2;
		color: #b91c1c;
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.825rem;
	}
	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		padding: 0.75rem 1.5rem 1.25rem;
		border-top: 1px solid #e2e8f0;
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
		background: #3b82f6;
		color: #fff;
	}
	.btn--secundario {
		background: #e2e8f0;
		color: #111;
	}
</style>
