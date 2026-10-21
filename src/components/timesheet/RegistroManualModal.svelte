<!--
  @component RegistroManualModal
  @description Modal para admin registrar batida retroativa de um colaborador.
  Conformidade Portaria 671: cria registro novo (não altera nenhum existente).
  O dia vem de quem abre (a linha da grade ou o dia do painel): só o horário se edita.
-->
<script lang="ts">
	import type { RegistroType } from '@/services/timesheet.service';
	import { capitalizar } from '@/utils/date';
	import { dataBrasiliaExtenso, instanteBrasilia } from '@/utils/relogio';

	interface Props {
		aberto: boolean;
		/** Nome do colaborador para quem a batida será registrada (exibido no cabeçalho). */
		colaboradorNome?: string;
		/** Dia da batida e horário sugerido, em Brasília (YYYY-MM-DDTHH:mm). O dia é fixo. */
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
	let dia = $state('');
	let hora = $state('');
	let motivo = $state('');
	let salvando = $state(false);
	let erro = $state('');

	$effect(() => {
		if (aberto) {
			tipo = tipoInicial;
			[dia, hora] = dataInicial.split('T');
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
		if (!hora) {
			erro = 'Informe o horário.';
			return;
		}

		const ts = instanteBrasilia(dia, hora);
		if (isNaN(ts.getTime())) {
			erro = 'Horário inválido.';
			return;
		}
		if (ts.getTime() > Date.now()) {
			erro = 'Não é possível registrar ponto em horário futuro.';
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
						<label for="hora">Horário</label>
						<input id="hora" type="time" bind:value={hora} required />
						{#if dia}
							<span class="campo__dia"
								>{capitalizar(dataBrasiliaExtenso(instanteBrasilia(dia, '12:00')))}</span
							>
						{/if}
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
	.campo {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	/* O dia é fixo (escolhido na grade ou no painel): só o horário se edita. */
	.campo__dia {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}
	label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text);
	}
	input,
	select,
	textarea {
		padding: 0.5rem 0.75rem;
		border: 1.5px solid var(--color-border);
		border-radius: 0.5rem;
		font-size: 0.9rem;
		background: var(--color-surface-muted);
		font-family: inherit;
	}
	input:focus,
	select:focus,
	textarea:focus {
		outline: none;
		border-color: var(--color-primary);
		background: var(--color-surface);
		box-shadow: 0 0 0 3px var(--color-primary-ring);
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
