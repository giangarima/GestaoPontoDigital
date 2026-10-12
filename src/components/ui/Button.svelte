<!--
  @component Button
  @description Botão reutilizável com variantes visuais.

  Uso:
    <Button variant="primary" on:click={handleClick}>Registrar Ponto</Button>
    <Button variant="outline" disabled>Aguarde...</Button>
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'primary' | 'secondary' | 'outline' | 'danger';
		size?: 'sm' | 'md' | 'lg';
		disabled?: boolean;
		loading?: boolean;
		type?: 'button' | 'submit' | 'reset';
		children: Snippet;
		onclick?: (e: MouseEvent) => void;
	}

	let {
		variant = 'primary',
		size = 'md',
		disabled = false,
		loading = false,
		type = 'button',
		children,
		onclick
	}: Props = $props();
</script>

<button {type} class="btn btn--{variant} btn--{size}" disabled={disabled || loading} {onclick}>
	{#if loading}
		<span class="btn__spinner" aria-hidden="true"></span>
	{/if}
	{@render children()}
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		border: none;
		border-radius: 0.5rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 150ms ease;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn--sm {
		padding: 0.375rem 0.75rem;
		font-size: 0.875rem;
	}
	.btn--md {
		padding: 0.625rem 1.25rem;
		font-size: 1rem;
	}
	.btn--lg {
		padding: 0.75rem 1.5rem;
		font-size: 1.125rem;
	}

	.btn--primary {
		background: var(--color-primary);
		color: var(--color-on-primary);
	}
	.btn--secondary {
		background: var(--color-text-muted);
		color: var(--color-on-primary);
	}
	.btn--outline {
		background: transparent;
		border: 2px solid var(--color-primary);
		color: var(--color-primary);
	}
	.btn--danger {
		background: var(--color-danger);
		color: var(--color-on-primary);
	}

	.btn__spinner {
		width: 1em;
		height: 1em;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
