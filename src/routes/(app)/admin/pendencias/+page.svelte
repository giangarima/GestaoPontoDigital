<!--
  @page /admin/pendencias
  @description Dias em aberto — jornadas com marcação faltando.

  Complementa /admin/ajustes: lá está a ferramenta de tratamento, mas ela exige
  que o admin já saiba QUEM e QUANDO. Esta tela é a descoberta — varre a empresa
  inteira no mês e leva cada dia direto ao lançamento manual.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { SvelteSet } from 'svelte/reactivity';
	import { adminService, type Pendencias } from '@/services/admin.service';
	import Badge from '@/components/ui/Badge.svelte';
	import Button from '@/components/ui/Button.svelte';
	import Card from '@/components/ui/Card.svelte';
	import Icon from '@/components/ui/Icon.svelte';
	import Paginacao from '@/components/ui/Paginacao.svelte';

	const hoje = new Date();
	const mesDefault = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

	let mes = $state(mesDefault);
	let dados = $state<Pendencias | null>(null);
	let loading = $state(false);
	let errorMsg = $state('');
	// SvelteSet já é reativo por si: muta no lugar, sem $state em volta.
	const expandido = new SvelteSet<string>();

	// A quebra é por colaborador, não por dia: cada card já é uma unidade, e
	// separar os dias de uma mesma pessoa entre páginas atrapalharia o tratamento.
	const POR_PAGINA = 10;
	let pagina = $state(1);
	const visiveis = $derived(
		dados ? dados.colaboradores.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA) : []
	);

	async function carregar() {
		loading = true;
		errorMsg = '';
		try {
			dados = await adminService.pendencias(mes);
			pagina = 1;
			expandido.clear();
			// Um colaborador só: já abre, poupa um clique.
			if (dados.colaboradores.length === 1) expandido.add(dados.colaboradores[0].colaboradorId);
		} catch {
			errorMsg = 'Erro ao carregar as pendências.';
			dados = null;
		} finally {
			loading = false;
		}
	}

	function alternar(id: string) {
		if (expandido.has(id)) expandido.delete(id);
		else expandido.add(id);
	}

	/** Query que posiciona o /admin/ajustes no colaborador e mês do dia. */
	function queryTratamento(colaboradorId: string, dia: string): string {
		return `?colaboradorId=${colaboradorId}&mes=${dia.slice(0, 7)}`;
	}

	function fmtDia(dia: string): string {
		const [, m, d] = dia.split('-');
		return `${d}/${m}`;
	}

	function fmtDuracao(min: number): string {
		return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
	}

	onMount(carregar);
</script>

<svelte:head><title>Dias em aberto — Admin</title></svelte:head>

<section class="admin-page">
	<header class="admin-page__header">
		<h1>Dias em aberto</h1>
		<label class="field field--inline">
			<span>Mês</span>
			<input type="month" bind:value={mes} onchange={carregar} />
		</label>
	</header>

	<p class="intro">
		Jornadas com número ímpar de marcações — o trabalhador deixou de bater um ponto. Esses dias não
		geram hora extra nem déficit até serem tratados.
	</p>

	{#if errorMsg}<div class="error">{errorMsg}</div>{/if}

	{#if loading}
		<Card><p class="muted">Carregando…</p></Card>
	{:else if !dados || dados.total === 0}
		<Card>
			<div class="vazio">
				<Icon name="check-circle" size={32} />
				<p>Nenhum dia em aberto neste mês.</p>
			</div>
		</Card>
	{:else}
		<div class="section-label">
			{dados.total}
			{dados.total === 1 ? 'dia em aberto' : 'dias em aberto'} em
			{dados.colaboradores.length}
			{dados.colaboradores.length === 1 ? 'colaborador' : 'colaboradores'}
		</div>

		<div class="lista">
			{#each visiveis as c (c.colaboradorId)}
				{@const aberto = expandido.has(c.colaboradorId)}
				<Card>
					<button
						type="button"
						class="cab"
						onclick={() => alternar(c.colaboradorId)}
						aria-expanded={aberto}
					>
						<span class="cab__chevron" class:cab__chevron--aberto={aberto}>
							<Icon name="chevron-right" size={16} />
						</span>
						<span class="cab__nome">
							{c.nome}
							{#if c.cargo}<small class="muted">{c.cargo}</small>{/if}
						</span>
						<Badge variant={c.dias.length > 3 ? 'danger' : 'warning'}>
							{c.dias.length}
							{c.dias.length === 1 ? 'dia' : 'dias'}
						</Badge>
					</button>

					{#if aberto}
						<ul class="dias">
							{#each c.dias as d (d.dia)}
								<li class="dia">
									<span class="dia__data">
										<strong>{fmtDia(d.dia)}</strong>
										<small class="muted">{d.semana}</small>
									</span>
									<span class="dia__marcacoes">
										{#each d.marcacoes as m, i (i)}
											<span class="marca" class:marca--incluida={m.fonte === 'I'}>
												{m.hora}
											</span>
										{/each}
										<span class="marca marca--falta" aria-label="marcação faltando">?</span>
									</span>
									<span class="dia__apurado muted">
										{fmtDuracao(d.realizadoMin)} apurado
									</span>
									<a
										class="dia__acao"
										href="{resolve('/admin/ajustes', {})}{queryTratamento(c.colaboradorId, d.dia)}"
									>
										<Button variant="outline" size="sm">Tratar</Button>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</Card>
			{/each}
		</div>

		<Paginacao
			bind:pagina
			total={dados.colaboradores.length}
			porPagina={POR_PAGINA}
			rotulo="colaboradores"
		/>

		<p class="rodape muted">
			Marcações em destaque já foram incluídas no tratamento. O lançamento da marcação faltante
			entra como inclusão do empregador — fora do AFD, registrada no AEJ com o motivo.
		</p>
	{/if}
</section>

<style>
	.intro {
		margin: 0;
		color: var(--color-text-muted);
		max-width: 68ch;
	}

	.field--inline {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.field--inline span {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-muted);
	}

	.section-label {
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.lista {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.cab {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
		color: inherit;
		font: inherit;
	}

	.cab__chevron {
		display: inline-flex;
		color: var(--color-text-muted);
		transition: transform 0.15s ease;
	}

	.cab__chevron--aberto {
		transform: rotate(90deg);
	}

	.cab__nome {
		flex: 1;
		display: flex;
		flex-direction: column;
		font-weight: 600;
	}

	.dias {
		list-style: none;
		margin: 1rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.dia {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		padding: 0.625rem 0.75rem;
		border-radius: 0.5rem;
		background: var(--color-surface-alt, rgba(127, 127, 127, 0.06));
	}

	.dia__data {
		display: flex;
		flex-direction: column;
		min-width: 4.5rem;
	}

	.dia__marcacoes {
		display: flex;
		gap: 0.375rem;
		flex-wrap: wrap;
		flex: 1;
	}

	.marca {
		font-variant-numeric: tabular-nums;
		font-size: 0.875rem;
		padding: 0.125rem 0.5rem;
		border-radius: 0.375rem;
		border: 1px solid var(--color-border, rgba(127, 127, 127, 0.25));
	}

	.marca--incluida {
		border-style: dashed;
		color: var(--color-text-muted);
	}

	.marca--falta {
		border-style: dashed;
		border-color: var(--color-warning, #b45309);
		color: var(--color-warning, #b45309);
		font-weight: 700;
	}

	.dia__apurado {
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
	}

	.dia__acao {
		text-decoration: none;
	}

	.vazio {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1.5rem 0;
		color: var(--color-text-muted);
	}

	.rodape {
		font-size: 0.8125rem;
		max-width: 68ch;
		margin: 0;
	}

	.muted {
		color: var(--color-text-muted);
	}
</style>
