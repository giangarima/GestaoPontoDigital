<!--
  @component LocaisTrabalho
  @description Cadastro dos locais de trabalho da empresa (ponto + raio) usados
  para conferir a geolocalização da batida. A batida fora de todos os locais entra
  do mesmo jeito e é sinalizada no painel e nos ajustes.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '@/components/ui/Button.svelte';
	import {
		localTrabalhoService,
		type LocalTrabalho,
		type LocalTrabalhoInput
	} from '@/services/local-trabalho.service';
	import { lerCoordenadas, linkMapa, obterPosicao } from '@/utils/geolocalizacao';

	const VAZIO: LocalTrabalhoInput = {
		nome: '',
		latitude: 0,
		longitude: 0,
		raioM: 150,
		ativo: true
	};

	let locais = $state<LocalTrabalho[]>([]);
	let carregando = $state(true);
	let erro = $state('');

	/** `null` = formulário fechado; `id: null` = novo local. */
	let editando = $state<{ id: string | null; dados: LocalTrabalhoInput } | null>(null);
	let coordenadas = $state('');
	let salvando = $state(false);
	let localizando = $state(false);

	const coordsLidas = $derived(lerCoordenadas(coordenadas));

	async function carregar() {
		carregando = true;
		try {
			locais = await localTrabalhoService.list();
		} catch {
			erro = 'Falha ao carregar os locais.';
		} finally {
			carregando = false;
		}
	}

	function abrir(local?: LocalTrabalho) {
		erro = '';
		if (local) {
			const { id, ...dados } = local;
			editando = { id, dados };
			coordenadas = `${local.latitude}, ${local.longitude}`;
		} else {
			editando = { id: null, dados: { ...VAZIO } };
			coordenadas = '';
		}
	}

	async function usarMinhaLocalizacao() {
		localizando = true;
		erro = '';
		const p = await obterPosicao(15000);
		localizando = false;
		if (!p) {
			erro = 'Não foi possível obter a localização deste dispositivo.';
			return;
		}
		coordenadas = `${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}`;
	}

	async function salvar() {
		if (!editando || !coordsLidas) return;
		salvando = true;
		erro = '';
		try {
			const dados = { ...editando.dados, ...coordsLidas, raioM: Number(editando.dados.raioM) };
			if (editando.id) await localTrabalhoService.update(editando.id, dados);
			else await localTrabalhoService.create(dados);
			editando = null;
			await carregar();
		} catch (e) {
			const err = e as { details?: { error?: string } };
			erro = err.details?.error ?? 'Erro ao salvar o local.';
		} finally {
			salvando = false;
		}
	}

	async function remover(local: LocalTrabalho) {
		if (!confirm(`Remover o local "${local.nome}"?`)) return;
		erro = '';
		try {
			const desativado = await localTrabalhoService.remove(local.id);
			if (desativado) erro = `"${local.nome}" tem batidas vinculadas: foi desativado, não apagado.`;
			await carregar();
		} catch {
			erro = 'Erro ao remover o local.';
		}
	}

	onMount(carregar);
</script>

<div class="card">
	<h2>Locais de trabalho</h2>
	<p class="hint">
		Na batida, a posição do celular é comparada com estes locais. Fora de todos — ou sem localização
		— a marcação entra do mesmo jeito e aparece como divergência no painel. Sem nenhum local ativo,
		a conferência fica desligada.
	</p>

	{#if erro}<p class="erro" role="alert">{erro}</p>{/if}

	{#if carregando}
		<p class="hint">Carregando…</p>
	{:else if locais.length > 0}
		<ul class="locais">
			{#each locais as local (local.id)}
				<li class="local" class:local--inativo={!local.ativo}>
					<div class="local__info">
						<span class="local__nome">{local.nome}{local.ativo ? '' : ' (inativo)'}</span>
						<!-- eslint-disable svelte/no-navigation-without-resolve -- link externo (OpenStreetMap) -->
						<a
							class="local__meta"
							href={linkMapa(local.latitude, local.longitude)}
							target="_blank"
							rel="noopener noreferrer">Raio de {local.raioM} m · ver no mapa</a
						>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</div>
					<div class="local__acoes">
						<Button variant="outline" size="sm" onclick={() => abrir(local)}>Editar</Button>
						<Button variant="outline" size="sm" onclick={() => remover(local)}>Remover</Button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#if editando}
		<div class="form">
			<label>Nome<input bind:value={editando.dados.nome} placeholder="Loja Centro" /></label>
			<label
				>Coordenadas
				<input bind:value={coordenadas} placeholder="-30.0346, -51.2177 (cole do Google Maps)" />
			</label>
			{#if coordenadas && !coordsLidas}
				<p class="erro-campo">Use o formato "latitude, longitude".</p>
			{/if}
			<Button variant="outline" size="sm" loading={localizando} onclick={usarMinhaLocalizacao}>
				Usar minha localização atual
			</Button>
			<label class="raio"
				>Raio (metros)
				<input type="number" min="20" max="5000" step="10" bind:value={editando.dados.raioM} />
			</label>
			<label class="check"
				><input type="checkbox" bind:checked={editando.dados.ativo} /> Ativo</label
			>
			<div class="form__acoes">
				<Button disabled={salvando || !coordsLidas || !editando.dados.nome.trim()} onclick={salvar}>
					{salvando ? 'Salvando…' : 'Salvar local'}
				</Button>
				<Button variant="outline" onclick={() => (editando = null)}>Cancelar</Button>
			</div>
		</div>
	{:else}
		<Button variant="outline" onclick={() => abrir()}>Adicionar local</Button>
	{/if}
</div>

<style>
	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 1.5rem;
	}
	.hint {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0 0 1rem;
	}
	.erro {
		background: var(--color-danger-bg);
		color: var(--color-danger);
		padding: 0.75rem;
		border-radius: var(--radius-sm);
		margin: 0 0 1rem;
		font-size: 0.875rem;
	}
	.erro-campo {
		color: var(--color-danger);
		font-size: 0.8125rem;
		margin: -0.5rem 0 0.75rem;
	}
	.locais {
		list-style: none;
		margin: 0 0 1rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.local {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
		padding: 0.625rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
	.local--inativo {
		opacity: 0.6;
	}
	.local__info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}
	.local__nome {
		font-weight: 600;
	}
	.local__meta {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}
	.local__acoes,
	.form__acoes {
		display: flex;
		gap: 0.5rem;
	}
	.form {
		border-top: 1px solid var(--color-border);
		padding-top: 1rem;
	}
	label {
		display: block;
		margin-bottom: 0.75rem;
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}
	label.raio {
		margin-top: 0.75rem;
	}
	label.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	input:not([type='checkbox']) {
		display: block;
		width: 100%;
		margin-top: 0.25rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.9rem;
	}
</style>
