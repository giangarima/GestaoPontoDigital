<!--
  @component RegistroAjusteModal
  @description Modal para admin corrigir uma batida existente.

  Ação principal "Salvar ajuste": anula a batida original e cria a corrigida,
  vinculadas (POST .../ajustar). Ação secundária "Anular":
  apenas invalida a batida (POST .../anular), para casos como clique duplicado.
  Conformidade Portaria 671: a batida original nunca é alterada nem removida.
  Só o horário é editável: o dia é o da batida (Brasília), escolhido na grade.
-->
<script lang="ts">
	import type { RegistroRecord, RegistroType } from '@/services/timesheet.service';
	import { capitalizar } from '@/utils/date';
	import { dataBrasiliaExtenso, diaEHoraBrasilia, instanteBrasilia } from '@/utils/relogio';

	interface Props {
		aberto: boolean;
		registro: RegistroRecord | null;
		onFechar: () => void;
		onAjustar: (dados: { type: RegistroType; timestamp: string; reason: string }) => Promise<void>;
		onAnular: (motivo: string) => Promise<void>;
	}

	let { aberto, registro, onFechar, onAjustar, onAnular }: Props = $props();

	const TIPO_LABEL: Record<string, string> = {
		entrada: 'Entrada',
		saida_almoco: 'Saída para almoço',
		retorno_almoco: 'Retorno do almoço',
		saida: 'Saída'
	};

	let tipo = $state<RegistroType>('entrada');
	let dia = $state('');
	let hora = $state('');
	let motivo = $state('');
	let salvando = $state(false);
	let erro = $state('');

	$effect(() => {
		if (aberto && registro) {
			tipo = registro.type;
			({ dia, hora } = diaEHoraBrasilia(registro.timestamp));
			motivo = '';
			erro = '';
		}
	});

	function validar(): { ts: Date; motivoLimpo: string } | null {
		erro = '';
		const motivoLimpo = motivo.trim();
		if (motivoLimpo.length < 5) {
			erro = 'Informe um motivo com ao menos 5 caracteres.';
			return null;
		}
		if (!hora) {
			erro = 'Informe o horário.';
			return null;
		}
		const ts = instanteBrasilia(dia, hora);
		if (isNaN(ts.getTime())) {
			erro = 'Horário inválido.';
			return null;
		}
		if (ts.getTime() > Date.now()) {
			erro = 'Não é possível registrar ponto em horário futuro.';
			return null;
		}
		return { ts, motivoLimpo };
	}

	async function handleAjustar(e: Event) {
		e.preventDefault();
		const v = validar();
		if (!v) return;
		salvando = true;
		try {
			await onAjustar({ type: tipo, timestamp: v.ts.toISOString(), reason: v.motivoLimpo });
		} catch {
			erro = 'Falha ao salvar ajuste. Tente novamente.';
		} finally {
			salvando = false;
		}
	}

	async function handleAnular() {
		erro = '';
		const motivoLimpo = motivo.trim();
		if (motivoLimpo.length < 5) {
			erro = 'Informe o motivo (mín. 5 caracteres) também para anular.';
			return;
		}
		salvando = true;
		try {
			await onAnular(motivoLimpo);
		} catch {
			erro = 'Falha ao anular marcação. Tente novamente.';
		} finally {
			salvando = false;
		}
	}

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget && !salvando) onFechar();
	}
</script>

{#if aberto && registro}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={handleBackdrop}>
		<div class="modal" role="dialog" aria-modal="true" aria-labelledby="ajuste-titulo">
			<form onsubmit={handleAjustar}>
				<header class="modal-header">
					<h2 id="ajuste-titulo">Ajustar marcação</h2>
					<button type="button" class="btn-fechar" onclick={onFechar} aria-label="Fechar">✕</button>
				</header>

				<div class="modal-body">
					<dl class="info">
						<div>
							<dt>Original</dt>
							<dd>
								{TIPO_LABEL[registro.type] ?? registro.type} —
								{new Date(registro.timestamp).toLocaleString('pt-BR')}
							</dd>
						</div>
						<div>
							<dt>Origem</dt>
							<dd>Manual</dd>
						</div>
					</dl>

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
						<label for="hora">Novo horário</label>
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
							placeholder="Ex.: Relógio adiantado — colaborador entrou às 08:00, não 08:12."
							required
						></textarea>
					</div>

					{#if erro}<div class="erro" role="alert">{erro}</div>{/if}
				</div>

				<footer class="modal-footer">
					<button
						type="button"
						class="btn btn--perigo-leve"
						onclick={handleAnular}
						disabled={salvando}
					>
						Anular
					</button>
					<div class="footer-direita">
						<button
							type="button"
							class="btn btn--secundario"
							onclick={onFechar}
							disabled={salvando}
						>
							Cancelar
						</button>
						<button type="submit" class="btn btn--primario" disabled={salvando}>
							{salvando ? 'Salvando...' : 'Salvar ajuste'}
						</button>
					</div>
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
		min-width: 70px;
		margin: 0;
	}
	.info dd {
		margin: 0;
		color: var(--color-text);
		font-weight: 500;
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
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.75rem 1.5rem 1.25rem;
		border-top: 1px solid var(--color-border);
	}
	.footer-direita {
		display: flex;
		gap: 0.75rem;
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
	.btn--perigo-leve {
		background: transparent;
		color: var(--color-danger);
		border: 1px solid var(--color-danger-border);
	}
</style>
