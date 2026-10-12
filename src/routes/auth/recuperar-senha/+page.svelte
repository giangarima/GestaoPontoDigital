<!--
  @page /auth/recuperar-senha
  @description Solicita recuperação de senha — colaborador por CPF, admin por e-mail.
  Envia um link de redefinição por e-mail. Resposta sempre genérica.
-->
<script lang="ts">
	import Button from '@/components/ui/Button.svelte';
	import { resolve } from '$app/paths';
	import Logo from '@/components/ui/Logo.svelte';
	import { authService } from '@/services/auth.service';
	import { isValidEmail, isValidCpf, isNotEmpty, formatCpfInput } from '@/utils/validators';

	type Tab = 'admin' | 'colaborador';

	let activeTab = $state<Tab>('colaborador');
	let identifier = $state('');
	let loading = $state(false);
	let errorMsg = $state('');
	let cpfError = $state('');
	let enviado = $state(false);

	function handleTabChange(tab: Tab): void {
		activeTab = tab;
		identifier = '';
		errorMsg = '';
		cpfError = '';
	}

	function handleCpfInput(e: Event): void {
		const input = e.target as HTMLInputElement;
		const raw = input.value;
		cpfError = /[a-zA-Z]/.test(raw) ? 'O CPF deve conter apenas números.' : '';
		identifier = formatCpfInput(raw);
	}

	function validate(): string | null {
		if (!isNotEmpty(identifier)) return 'Preencha o campo.';
		if (activeTab === 'admin' && !isValidEmail(identifier)) return 'E-mail inválido.';
		if (activeTab === 'colaborador' && !isValidCpf(identifier)) return 'CPF inválido.';
		return null;
	}

	async function handleSubmit(): Promise<void> {
		if (cpfError) return;
		const validationError = validate();
		if (validationError) {
			errorMsg = validationError;
			return;
		}

		loading = true;
		errorMsg = '';
		try {
			await authService.forgotPassword(identifier);
			enviado = true;
		} catch {
			// Mesmo em erro inesperado, não revelamos existência da conta.
			enviado = true;
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Recuperar senha — On Time</title>
</svelte:head>

<div class="login-page">
	<form
		class="login-card"
		onsubmit={(e) => {
			e.preventDefault();
			handleSubmit();
		}}
	>
		<div class="brand">
			<Logo size="lg" />
		</div>

		{#if enviado}
			<h1>Verifique seu e-mail</h1>
			<p class="subtitle">
				Se a conta existir, enviamos um link para redefinir a senha. O link expira em 1 hora.
			</p>
			<a class="back-link" href={resolve('/auth/login', {})}>Voltar para o login</a>
		{:else}
			<h1>Recuperar senha</h1>
			<p class="subtitle">Informe seus dados para receber o link de redefinição</p>

			<div class="tabs" role="tablist">
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === 'colaborador'}
					class="tab"
					class:tab--active={activeTab === 'colaborador'}
					onclick={() => handleTabChange('colaborador')}
				>
					Colaborador
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === 'admin'}
					class="tab"
					class:tab--active={activeTab === 'admin'}
					onclick={() => handleTabChange('admin')}
				>
					Administrador
				</button>
			</div>

			{#if errorMsg}
				<div class="error" role="alert" aria-live="assertive">{errorMsg}</div>
			{/if}

			{#if activeTab === 'admin'}
				<div class="field">
					<label for="identifier">E-mail</label>
					<input
						id="identifier"
						type="email"
						bind:value={identifier}
						placeholder="seu@email.com"
						autocomplete="email"
						aria-required="true"
					/>
				</div>
			{:else}
				<div class="field">
					<label for="identifier">CPF</label>
					<input
						id="identifier"
						type="text"
						value={identifier}
						oninput={handleCpfInput}
						placeholder="000.000.000-00"
						inputmode="numeric"
						maxlength="14"
						autocomplete="username"
						aria-required="true"
						aria-invalid={cpfError ? 'true' : 'false'}
						aria-describedby={cpfError ? 'cpf-erro' : undefined}
					/>
					{#if cpfError}
						<span id="cpf-erro" class="field-error" role="alert" aria-live="polite">
							{cpfError}
						</span>
					{/if}
				</div>
			{/if}

			<Button type="submit" variant="primary" {loading}>Enviar link</Button>
			<a class="back-link" href={resolve('/auth/login', {})}>Voltar para o login</a>
		{/if}
	</form>
</div>

<style>
	.login-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: var(--color-bg);
		padding: 1rem;
	}

	.login-card {
		background: var(--color-surface);
		padding: 2.5rem 2rem;
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-elev);
		width: 100%;
		max-width: 400px;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.brand {
		margin-bottom: 1rem;
	}

	.login-card h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
		letter-spacing: -0.02em;
	}

	.subtitle {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		margin: 0 0 0.75rem;
	}

	.tabs {
		display: flex;
		border-radius: var(--radius-sm);
		overflow: hidden;
		border: 1px solid var(--color-border);
	}

	.tab {
		flex: 1;
		padding: 0.625rem;
		border: none;
		background: var(--color-surface-muted);
		color: var(--color-text-muted);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
		transition: all 150ms ease;
	}

	.tab--active {
		background: var(--color-primary);
		color: #fff;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: #374151;
	}

	input {
		padding: 0.625rem 0.875rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.9375rem;
		color: var(--color-text);
		font-family: inherit;
		transition: border-color 150ms ease;
	}

	input[aria-invalid='true'] {
		border-color: var(--color-danger);
	}

	.field-error {
		font-size: 0.8rem;
		color: var(--color-danger);
	}

	.error {
		background: var(--color-danger-bg);
		color: var(--color-danger);
		padding: 0.625rem 0.875rem;
		border-radius: var(--radius-sm);
		text-align: center;
		font-size: 0.875rem;
	}

	.back-link {
		text-align: center;
		font-size: 0.8125rem;
		color: var(--color-primary);
		text-decoration: none;
		font-weight: 600;
	}

	.back-link:hover {
		text-decoration: underline;
	}
</style>
