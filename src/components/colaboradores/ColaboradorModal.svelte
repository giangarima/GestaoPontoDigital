<!-- src/components/colaboradores/ColaboradorModal.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import type {
		Colaborador,
		ColaboradorFormData,
		StatusColaborador
	} from '../../types/colaborador';
	import { jornadaService, type Jornada } from '../../services/jornada.service';
	import { departamentoService, type Departamento } from '../../services/departamento.service';
	import {
		colaboradorCreateSchema,
		colaboradorUpdateSchema
	} from '$lib/schemas/colaborador.schema';

	interface Props {
		aberto: boolean;
		colaborador?: Colaborador | null;
		onFechar: () => void;
		onSalvar: (dados: ColaboradorFormData) => Promise<void>;
		onExcluir?: () => void;
	}

	let { aberto, colaborador = null, onFechar, onSalvar, onExcluir }: Props = $props();

	const statusOpcoes: { value: StatusColaborador; label: string }[] = [
		{ value: 'ativo', label: 'Ativo' },
		{ value: 'inativo', label: 'Inativo' },
		{ value: 'ferias', label: 'Férias' },
		{ value: 'afastado', label: 'Afastado' }
	];

	let form = $state<ColaboradorFormData>({
		nome: '',
		email: '',
		cpf: '',
		cargo: '',
		departamentoId: '',
		dataAdmissao: '',
		status: 'ativo',
		telefone: '',
		jornadaId: ''
	});

	let erros = $state<Partial<Record<keyof ColaboradorFormData, string>>>({});
	let erroServidor = $state<string | null>(null);
	let salvando = $state(false);

	let aba = $state<'dados' | 'jornada'>('dados');
	let jornadas = $state<Jornada[]>([]);
	let departamentos = $state<Departamento[]>([]);
	let carregandoListas = $state(false);

	onMount(async () => {
		carregandoListas = true;
		try {
			const [jors, deps] = await Promise.all([jornadaService.list(), departamentoService.list()]);
			jornadas = jors;
			departamentos = deps;
		} catch {
			jornadas = [];
			departamentos = [];
		} finally {
			carregandoListas = false;
		}
	});

	$effect(() => {
		if (colaborador) {
			form = {
				nome: colaborador.nome,
				email: colaborador.email,
				cpf: colaborador.cpf,
				cargo: colaborador.cargo,
				departamentoId: colaborador.departamentoId ?? '',
				dataAdmissao: colaborador.dataAdmissao,
				status: colaborador.status,
				telefone: colaborador.telefone ?? '',
				jornadaId: colaborador.jornadaId ?? ''
			};
		} else {
			form = {
				nome: '',
				email: '',
				cpf: '',
				cargo: '',
				departamentoId: '',
				dataAdmissao: '',
				status: 'ativo',
				telefone: '',
				jornadaId: ''
			};
		}
		aba = 'dados';
		erros = {};
		erroServidor = null;
	});

	function handleCpfInput(e: Event): void {
		const input = e.target as HTMLInputElement;
		const raw = input.value;

		if (/[a-zA-Z]/.test(raw)) {
			erros = { ...erros, cpf: 'O CPF deve conter apenas números.' };
		} else {
			const resto = { ...erros };
			delete resto.cpf;
			erros = resto;
		}

		form.cpf = raw.replace(/[a-zA-Z]/g, '');
	}

	function handleTelefoneInput(e: Event): void {
		const input = e.target as HTMLInputElement;
		const raw = input.value;

		if (/[a-zA-Z]/.test(raw)) {
			erros = { ...erros, telefone: 'O telefone deve conter apenas números.' };
		} else {
			const resto = { ...erros };
			delete resto.telefone;
			erros = resto;
		}

		form.telefone = raw.replace(/[a-zA-Z]/g, '');
	}

	function validar(): boolean {
		// Mesmo schema Zod usado no servidor (fonte única de validação de formato).
		const schema = colaborador ? colaboradorUpdateSchema : colaboradorCreateSchema;
		const resultado = schema.safeParse({ ...form });

		const novosErros: typeof erros = {};
		if (!resultado.success) {
			for (const issue of resultado.error.issues) {
				const campo = issue.path[0] as keyof ColaboradorFormData;
				if (campo && !novosErros[campo]) novosErros[campo] = issue.message;
			}
		}
		// Preserva o erro vivo de telefone (apenas números), tratado no oninput.
		if (erros.telefone) novosErros.telefone = erros.telefone;

		erros = novosErros;
		return Object.keys(novosErros).length === 0;
	}

	async function handleSubmit() {
		erroServidor = null;
		if (!validar()) return;

		salvando = true;
		try {
			await onSalvar({ ...form });
		} catch (e) {
			const err = e as { details?: { error?: string; field?: keyof ColaboradorFormData } };
			const msg = err.details?.error ?? 'Erro ao salvar colaborador.';
			if (err.details?.field) {
				erros = { ...erros, [err.details.field]: msg };
				// Campo de jornada fica na aba "jornada"; leva o usuário até ele.
				if (err.details.field === 'jornadaId') aba = 'jornada';
			} else {
				erroServidor = msg;
			}
		} finally {
			salvando = false;
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onFechar();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onFechar();
	}
</script>

{#if aberto}
	<div
		class="modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-titulo"
		tabindex="-1"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
	>
		<form
			class="modal"
			onsubmit={(e) => {
				e.preventDefault();
				handleSubmit();
			}}
		>
			<header class="modal-header">
				<h2 id="modal-titulo">{colaborador ? 'Editar Colaborador' : 'Novo Colaborador'}</h2>
				<button type="button" class="btn-fechar" onclick={onFechar} aria-label="Fechar modal"
					>✕</button
				>
			</header>

			<div class="modal-tabs" role="tablist">
				<button
					type="button"
					role="tab"
					aria-selected={aba === 'dados'}
					class="modal-tab"
					class:modal-tab--ativa={aba === 'dados'}
					onclick={() => (aba = 'dados')}
				>
					Dados
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={aba === 'jornada'}
					class="modal-tab"
					class:modal-tab--ativa={aba === 'jornada'}
					onclick={() => (aba = 'jornada')}
				>
					Jornada
				</button>
			</div>

			{#if erroServidor}
				<div class="banner-erro" role="alert">{erroServidor}</div>
			{/if}

			<div class="modal-body">
				{#if aba === 'dados'}
					<div class="form-grid">
						<!-- Nome -->
						<div class="campo campo--full">
							<label for="nome">Nome completo *</label>
							<input
								id="nome"
								type="text"
								bind:value={form.nome}
								class:erro={!!erros.nome}
								placeholder="Ex: João Silva"
								aria-required="true"
								aria-invalid={!!erros.nome}
								aria-describedby={erros.nome ? 'erro-nome' : undefined}
							/>
							{#if erros.nome}
								<span id="erro-nome" class="msg-erro" role="alert">{erros.nome}</span>
							{/if}
						</div>

						<!-- E-mail -->
						<div class="campo">
							<label for="email">E-mail *</label>
							<input
								id="email"
								type="email"
								bind:value={form.email}
								class:erro={!!erros.email}
								placeholder="joao@empresa.com"
								aria-required="true"
								aria-invalid={!!erros.email}
								aria-describedby={erros.email ? 'erro-email' : undefined}
							/>
							{#if erros.email}
								<span id="erro-email" class="msg-erro" role="alert">{erros.email}</span>
							{/if}
						</div>

						<!-- CPF -->
						<div class="campo">
							<label for="cpf">CPF *</label>
							<input
								id="cpf"
								type="text"
								value={form.cpf}
								oninput={handleCpfInput}
								class:erro={!!erros.cpf}
								placeholder="000.000.000-00"
								inputmode="numeric"
								aria-required="true"
								aria-invalid={!!erros.cpf}
								aria-describedby={erros.cpf ? 'erro-cpf' : undefined}
							/>
							{#if erros.cpf}
								<span id="erro-cpf" class="msg-erro" role="alert">{erros.cpf}</span>
							{/if}
						</div>

						<!-- Cargo -->
						<div class="campo">
							<label for="cargo">Cargo *</label>
							<input
								id="cargo"
								type="text"
								bind:value={form.cargo}
								class:erro={!!erros.cargo}
								placeholder="Ex: Desenvolvedor"
								aria-required="true"
								aria-invalid={!!erros.cargo}
								aria-describedby={erros.cargo ? 'erro-cargo' : undefined}
							/>
							{#if erros.cargo}
								<span id="erro-cargo" class="msg-erro" role="alert">{erros.cargo}</span>
							{/if}
						</div>

						<!-- Departamento -->
						<div class="campo">
							<label for="departamentoId">Departamento *</label>
							{#if carregandoListas}
								<p class="msg-hint">Carregando departamentos…</p>
							{:else if departamentos.length === 0}
								<p class="msg-hint">
									Nenhum departamento cadastrado. Cadastre um em
									<a href={resolve('/admin/departamentos', {})}>Departamentos</a> antes.
								</p>
							{:else}
								<select
									id="departamentoId"
									bind:value={form.departamentoId}
									class:erro={!!erros.departamentoId}
									aria-required="true"
									aria-invalid={!!erros.departamentoId}
									aria-describedby={erros.departamentoId ? 'erro-departamento' : undefined}
								>
									<option value="">Selecione…</option>
									{#each departamentos as d (d.id)}
										<option value={d.id}>{d.nome}</option>
									{/each}
								</select>
							{/if}
							{#if erros.departamentoId}
								<span id="erro-departamento" class="msg-erro" role="alert"
									>{erros.departamentoId}</span
								>
							{/if}
						</div>

						<!-- Data de admissão -->
						<div class="campo">
							<label for="dataAdmissao">Data de admissão *</label>
							<input
								id="dataAdmissao"
								type="date"
								bind:value={form.dataAdmissao}
								class:erro={!!erros.dataAdmissao}
								aria-required="true"
								aria-invalid={!!erros.dataAdmissao}
								aria-describedby={erros.dataAdmissao ? 'erro-dataAdmissao' : undefined}
							/>
							{#if erros.dataAdmissao}
								<span id="erro-dataAdmissao" class="msg-erro" role="alert"
									>{erros.dataAdmissao}</span
								>
							{/if}
						</div>

						<!-- Status -->
						<div class="campo">
							<label for="status">Status</label>
							<select id="status" bind:value={form.status} aria-required="true">
								{#each statusOpcoes as opt (opt.value)}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						</div>

						<!-- Telefone -->
						<div class="campo">
							<label for="telefone">Telefone</label>
							<input
								id="telefone"
								type="tel"
								value={form.telefone}
								oninput={handleTelefoneInput}
								placeholder="(11) 99999-9999"
								inputmode="numeric"
								class:erro={!!erros.telefone}
								aria-invalid={!!erros.telefone}
								aria-describedby={erros.telefone ? 'erro-telefone' : undefined}
							/>
							{#if erros.telefone}
								<span id="erro-telefone" class="msg-erro" role="alert">{erros.telefone}</span>
							{/if}
						</div>
					</div>
				{:else}
					<div class="aba-jornada">
						<div class="campo campo--full">
							<label for="jornadaId">Jornada de trabalho</label>
							{#if carregandoListas}
								<p class="aba-jornada__hint">Carregando jornadas…</p>
							{:else if jornadas.length === 0}
								<p class="aba-jornada__hint">
									Nenhuma jornada cadastrada. Cadastre uma em <strong>Jornadas</strong> antes de vincular
									ao colaborador.
								</p>
							{:else}
								<select id="jornadaId" bind:value={form.jornadaId}>
									<option value="">Sem jornada vinculada</option>
									{#each jornadas as j (j.id)}
										<option value={j.id}>{j.nome}</option>
									{/each}
								</select>
								<p class="aba-jornada__hint">
									Vincule o colaborador a uma jornada existente. A alteração é salva ao clicar em
									<strong>Salvar alterações</strong>.
								</p>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<footer class="modal-footer">
				{#if colaborador && onExcluir}
					<button type="button" class="btn btn--perigo" onclick={onExcluir}>Excluir</button>
				{/if}
				<button type="button" class="btn btn--secundario" onclick={onFechar} disabled={salvando}
					>Cancelar</button
				>
				<button type="submit" class="btn btn--primario" disabled={salvando}>
					{#if salvando}
						Salvando…
					{:else}
						{colaborador ? 'Salvar alterações' : 'Criar colaborador'}
					{/if}
				</button>
			</footer>
		</form>
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
		max-width: 640px;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem 1.5rem 0;
	}

	.modal-header h2 {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.btn-fechar {
		background: none;
		border: none;
		font-size: 1.125rem;
		color: var(--color-text-muted);
		cursor: pointer;
		padding: 0.25rem;
		line-height: 1;
		border-radius: 0.25rem;
		transition: color 0.15s;
	}

	.btn-fechar:hover {
		color: var(--color-text);
	}

	.modal-tabs {
		display: flex;
		gap: 0.25rem;
		padding: 0.5rem 1.5rem 0;
		border-bottom: 1px solid var(--color-border);
	}

	.modal-tab {
		background: none;
		border: none;
		padding: 0.625rem 1rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-muted);
		cursor: pointer;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}

	.modal-tab--ativa {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	.banner-erro {
		margin: 0.75rem 1.5rem 0;
		padding: 0.625rem 0.875rem;
		border-radius: 0.5rem;
		background: var(--color-danger-bg);
		border: 1px solid var(--color-danger);
		color: var(--color-danger);
		font-size: 0.8125rem;
	}

	.modal-body {
		padding: 1.5rem;
	}

	.aba-jornada__hint {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0.5rem 0 0;
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.campo {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.campo--full {
		grid-column: 1 / -1;
	}

	label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text);
	}

	input,
	select {
		padding: 0.625rem 0.75rem;
		border: 1.5px solid var(--color-border);
		border-radius: 0.5rem;
		font-size: 0.9rem;
		color: var(--color-text);
		background: var(--color-surface-muted);
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
		outline: none;
		width: 100%;
		box-sizing: border-box;
	}

	input:focus,
	select:focus {
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px var(--color-primary-ring);
		background: var(--color-surface);
	}

	input.erro,
	input[aria-invalid='true'] {
		border-color: var(--color-danger);
	}

	.msg-erro {
		font-size: 0.75rem;
		color: var(--color-danger);
	}

	.msg-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	.msg-hint a {
		color: var(--color-primary);
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		padding: 1rem 1.5rem 1.5rem;
		border-top: 1px solid var(--color-border);
	}

	.btn--perigo {
		margin-right: auto;
		background: var(--color-danger);
		color: var(--color-on-primary);
	}

	.btn--perigo:hover {
		opacity: 0.9;
	}

	.btn {
		padding: 0.625rem 1.25rem;
		border-radius: 0.5rem;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		transition:
			background 0.15s,
			opacity 0.15s;
		border: none;
	}

	.btn--primario {
		background: var(--color-primary);
		color: var(--color-on-primary);
	}

	.btn--primario:hover {
		opacity: 0.9;
	}

	.btn--secundario {
		background: var(--color-border);
		color: var(--color-text);
	}

	.btn--secundario:hover {
		opacity: 0.8;
	}

	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	@media (max-width: 480px) {
		.form-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
