<!--
  @component SeletorTema
  @description Alterna claro/escuro e escolhe a cor de destaque (azul/violeta).
  O estado visual (ícone sol/lua, bolinha ativa) sai do CSS a partir de
  `data-theme`/`data-accent` em <html> — o SSR não sabe o tema, e assim a
  hidratação não precisa saber também.
-->
<script lang="ts">
	import Icon from '@/components/ui/Icon.svelte';
	import { tema, alternarModo, definirDestaque, type Destaque } from '@/store/theme.store';

	interface Props {
		/** `sidebar`: sobre o fundo sempre escuro da sidebar. `superficie`: sobre card/topbar. */
		variante?: 'sidebar' | 'superficie';
	}

	let { variante = 'superficie' }: Props = $props();

	const destaques: { valor: Destaque; rotulo: string }[] = [
		{ valor: 'azul', rotulo: 'Destaque azul' },
		{ valor: 'violeta', rotulo: 'Destaque violeta' }
	];
</script>

<div class="seletor seletor--{variante}">
	<button
		type="button"
		class="seletor__modo"
		onclick={alternarModo}
		aria-label="Alternar tema claro/escuro"
		title="Alternar tema claro/escuro"
	>
		<span class="seletor__icone seletor__icone--sol"><Icon name="sun" size={16} /></span>
		<span class="seletor__icone seletor__icone--lua"><Icon name="moon" size={16} /></span>
	</button>
	<div class="seletor__cores" role="group" aria-label="Cor de destaque">
		{#each destaques as d (d.valor)}
			<button
				type="button"
				class="seletor__cor seletor__cor--{d.valor}"
				aria-label={d.rotulo}
				aria-pressed={$tema.destaque === d.valor}
				title={d.rotulo}
				onclick={() => definirDestaque(d.valor)}
			></button>
		{/each}
	</div>
</div>

<style>
	.seletor {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}

	.seletor__modo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text-muted);
		cursor: pointer;
	}

	.seletor__modo:hover {
		color: var(--color-text);
		background: var(--color-hover);
	}

	.seletor--sidebar .seletor__modo {
		border-color: var(--color-sidebar-border);
		background: transparent;
		color: var(--color-sidebar-fg-muted);
	}

	.seletor--sidebar .seletor__modo:hover {
		color: var(--color-sidebar-fg-strong);
		background: var(--color-sidebar-border);
	}

	/* Mostra a lua no claro (vai para o escuro) e o sol no escuro. */
	.seletor__icone {
		display: inline-flex;
	}
	.seletor__icone--sol {
		display: none;
	}
	:global(:root[data-theme='dark']) .seletor__icone--sol {
		display: inline-flex;
	}
	:global(:root[data-theme='dark']) .seletor__icone--lua {
		display: none;
	}

	.seletor__cores {
		display: inline-flex;
		gap: 0.375rem;
	}

	/* Cores fixas de propósito: a bolinha representa a opção, não o tema atual. */
	.seletor__cor {
		width: 18px;
		height: 18px;
		padding: 0;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
		box-shadow: 0 0 0 1px var(--color-border);
	}
	.seletor--sidebar .seletor__cor {
		box-shadow: 0 0 0 1px var(--color-sidebar-border);
	}
	.seletor__cor--azul {
		background: #2563eb;
	}
	.seletor__cor--violeta {
		background: #7c3aed;
	}

	:global(:root:not([data-accent='violeta'])) .seletor__cor--azul,
	:global(:root[data-accent='violeta']) .seletor__cor--violeta {
		border-color: var(--color-surface);
		box-shadow: 0 0 0 2px var(--color-text);
	}
	:global(:root:not([data-accent='violeta'])) .seletor--sidebar .seletor__cor--azul,
	:global(:root[data-accent='violeta']) .seletor--sidebar .seletor__cor--violeta {
		border-color: var(--color-sidebar);
		box-shadow: 0 0 0 2px var(--color-sidebar-fg-strong);
	}
</style>
