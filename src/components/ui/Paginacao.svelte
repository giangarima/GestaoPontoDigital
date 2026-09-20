<!--
  @component Paginacao
  @description Quebra de lista em páginas, no client.

  As listas do admin (colaboradores, justificativas, férias, dias em aberto)
  crescem com o tempo e ficam longas demais para rolar. Este componente cuida
  só da navegação: quem usa fatia a própria lista com `inicio`/`fim`.

  Uso:
    let pagina = $state(1);
    const visiveis = $derived(lista.slice((pagina - 1) * 20, pagina * 20));
    <Paginacao bind:pagina total={lista.length} rotulo="justificativas" />

  Some sozinho quando tudo cabe numa página.
-->
<script lang="ts">
	import {
		ELIPSE,
		intervaloDaPagina,
		numerosDePagina,
		paginaValida,
		totalDePaginas
	} from '@/utils/paginacao';

	interface Props {
		/** Página atual, 1-based. Bindable. */
		pagina: number;
		/** Total de itens da lista inteira (não da página). */
		total: number;
		/** Itens por página. */
		porPagina?: number;
		/** Nome do que está sendo listado, para o resumo e o rótulo acessível. */
		rotulo?: string;
	}

	let { pagina = $bindable(1), total, porPagina = 20, rotulo = 'itens' }: Props = $props();

	const totalPaginas = $derived(totalDePaginas(total, porPagina));
	const intervalo = $derived(intervaloDaPagina(pagina, total, porPagina));
	const numeros = $derived(numerosDePagina(pagina, totalPaginas));

	function ir(p: number) {
		pagina = paginaValida(p, totalPaginas);
	}

	// A lista pode encolher (busca, filtro, remoção) e deixar a página atual
	// fora do intervalo — nesse caso volta para a última que ainda existe.
	$effect(() => {
		if (pagina > totalPaginas) pagina = totalPaginas;
	});
</script>

{#if totalPaginas > 1}
	<nav class="paginacao" aria-label="Paginação de {rotulo}">
		<p class="paginacao__resumo" aria-live="polite">
			{intervalo[0]}–{intervalo[1]} de {total}
			{rotulo}
		</p>

		<div class="paginacao__controles">
			<button
				type="button"
				class="paginacao__btn"
				onclick={() => ir(pagina - 1)}
				disabled={pagina === 1}
				aria-label="Página anterior"
			>
				‹
			</button>

			{#each numeros as n, i (i)}
				{#if n === ELIPSE}
					<span class="paginacao__elipse" aria-hidden="true">…</span>
				{:else}
					<button
						type="button"
						class="paginacao__btn"
						class:paginacao__btn--atual={n === pagina}
						onclick={() => ir(n)}
						aria-label="Página {n}"
						aria-current={n === pagina ? 'page' : undefined}
					>
						{n}
					</button>
				{/if}
			{/each}

			<button
				type="button"
				class="paginacao__btn"
				onclick={() => ir(pagina + 1)}
				disabled={pagina === totalPaginas}
				aria-label="Próxima página"
			>
				›
			</button>
		</div>
	</nav>
{/if}

<style>
	.paginacao {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-top: 0.5rem;
	}

	.paginacao__resumo {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}

	.paginacao__controles {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin-left: auto;
	}

	.paginacao__btn {
		min-width: 2rem;
		height: 2rem;
		padding: 0 0.5rem;
		border: 1px solid var(--color-border, rgba(127, 127, 127, 0.25));
		border-radius: 0.5rem;
		background: var(--color-surface, transparent);
		color: var(--color-text);
		font: inherit;
		font-size: 0.875rem;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		transition:
			background 0.12s ease,
			border-color 0.12s ease;
	}

	.paginacao__btn:hover:not(:disabled) {
		border-color: var(--color-primary, #2563eb);
	}

	.paginacao__btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.paginacao__btn--atual {
		background: var(--color-primary, #2563eb);
		border-color: var(--color-primary, #2563eb);
		color: #fff;
		font-weight: 600;
	}

	.paginacao__elipse {
		padding: 0 0.25rem;
		color: var(--color-text-muted);
	}

	@media (max-width: 480px) {
		.paginacao {
			justify-content: center;
		}

		.paginacao__controles {
			margin-left: 0;
		}
	}
</style>
