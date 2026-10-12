<!--
  @page /auth/redefinir-senha
  @description Define uma nova senha a partir do token recebido por e-mail.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { resolve } from '$app/paths';
	import Button from '@/components/ui/Button.svelte';
	import Logo from '@/components/ui/Logo.svelte';
	import { authService } from '@/services/auth.service';
	import { isStrongPassword } from '@/utils/validators';

	let token = $state('');
	let password = $state('');
	let confirm = $state('');
	let loading = $state(false);
	let errorMsg = $state('');
	let sucesso = $state(false);

	onMount(() => {
		token = $page.url.searchParams.get('token') ?? '';
		if (!token) errorMsg = 'Link inválido ou incompleto. Solicite a recuperação novamente.';
	});

	function validate(): string | null {
		if (!isStrongPassword(password)) {
			return 'A senha deve ter ao menos 8 caracteres, uma letra maiúscula e um número.';
		}
		if (password !== confirm) return 'As senhas não coincidem.';
		return null;
	}

	async function handleSubmit(): Promise<void> {
		if (!token) return;
		const validationError = validate();
		if (validationError) {
			errorMsg = validationError;
			return;
		}

		loading = true;
		errorMsg = '';
		try {
			await authService.resetPassword(token, password);
			sucesso = true;
			setTimeout(() => goto(resolve('/auth/login', {})), 1800);
		} catch {
			errorMsg =
				'Não foi possível redefinir a senha. O link pode ter expirado ou já ter sido usado.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Redefinir senha — On Time</title>
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

		{#if sucesso}
			<h1>Senha redefinida</h1>
			<p class="subtitle">Redirecionando para o login…</p>
		{:else}
			<h1>Criar nova senha</h1>
			<p class="subtitle">Escolha uma nova senha para sua conta</p>

			{#if errorMsg}
				<div class="error" role="alert" aria-live="assertive">{errorMsg}</div>
			{/if}

			<div class="field">
				<label for="password">Nova senha</label>
				<input
					id="password"
					type="password"
					bind:value={password}
					placeholder="••••••••"
					autocomplete="new-password"
					aria-required="true"
					disabled={!token}
				/>
			</div>

			<div class="field">
				<label for="confirm">Confirmar senha</label>
				<input
					id="confirm"
					type="password"
					bind:value={confirm}
					placeholder="••••••••"
					autocomplete="new-password"
					aria-required="true"
					disabled={!token}
				/>
			</div>

			<Button type="submit" variant="primary" {loading} disabled={!token}>Redefinir senha</Button>
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
		border: 1px solid var(--color-border);
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

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-text-secondary);
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
