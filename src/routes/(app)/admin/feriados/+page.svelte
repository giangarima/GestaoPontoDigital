<!--
  @page /admin/feriados
  @description Feriados e pontos facultativos do ano: nacionais (fixos em lei),
  estaduais e municipais cadastrados pela empresa, e a escala de quem trabalha em
  cada um — a empresa pode abrir com equipe reduzida. Fora da escala o dia é sem
  expediente (nem falta, nem déficit); quem está escalado segue a jornada.
-->
<script lang="ts">
	import Badge from '@/components/ui/Badge.svelte';
	import Button from '@/components/ui/Button.svelte';
	import {
		ROTULO_TIPO,
		feriadoService,
		type Abrangencia,
		type Feriado,
		type FeriadoInput,
		type FeriadosDoAno,
		type SugestaoFeriado
	} from '@/services/feriado.service';
	import { colaboradorService } from '@/services/colaborador.service';
	import type { Colaborador } from '@/types/colaborador';

	const anoAtual = new Date().getFullYear();
	const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
	const ROTULO_ABRANGENCIA: Record<Abrangencia, string> = {
		nacional: 'Nacional',
		estadual: 'Estadual',
		municipal: 'Municipal'
	};
	const FORM_VAZIO: FeriadoInput = {
		data: '',
		nome: '',
		tipo: 'feriado',
		abrangencia: 'municipal'
	};

	let ano = $state(anoAtual);
	let dados = $state<FeriadosDoAno | null>(null);
	let colaboradores = $state<Colaborador[]>([]);
	let loading = $state(false);
	let saving = $state(false);
	let errorMsg = $state('');
	let form = $state<FeriadoInput>({ ...FORM_VAZIO });

	// Modal de escala
	let alvo = $state<Feriado | null>(null);
	let selecionados = $state<string[]>([]);

	/** Colaboradores ativos agrupados por departamento, para escalar uma equipe inteira de uma vez. */
	const porDepartamento = $derived.by(() => {
		const grupos: Record<string, Colaborador[]> = {};
		for (const c of colaboradores) {
			(grupos[c.departamento?.nome ?? 'Sem departamento'] ??= []).push(c);
		}
		return Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
	});

	function formatarData(dia: string): string {
		const [a, m, d] = dia.split('-');
		const semana = SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()];
		return `${d}/${m}/${a} (${semana})`;
	}

	async function carregar() {
		loading = true;
		errorMsg = '';
		try {
			dados = await feriadoService.list(ano);
		} catch {
			errorMsg = 'Erro ao carregar feriados.';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		void ano;
		carregar();
	});

	$effect(() => {
		colaboradorService
			.listar()
			.then((lista) => (colaboradores = lista))
			.catch(() => (errorMsg = 'Erro ao carregar colaboradores.'));
	});

	function usarSugestao(s: SugestaoFeriado) {
		form = { data: s.data, nome: s.nome, tipo: s.tipo, abrangencia: s.abrangencia };
	}

	async function adicionar() {
		saving = true;
		errorMsg = '';
		try {
			await feriadoService.create({ ...form, nome: form.nome.trim() });
			form = { ...FORM_VAZIO };
			await carregar();
		} catch (e) {
			const err = e as { details?: { error?: string } };
			errorMsg = err.details?.error ?? 'Erro ao cadastrar feriado.';
		} finally {
			saving = false;
		}
	}

	async function remover(id: string) {
		errorMsg = '';
		try {
			await feriadoService.remove(id);
			await carregar();
		} catch {
			errorMsg = 'Erro ao excluir feriado.';
		}
	}

	function abrirEscala(f: Feriado) {
		alvo = f;
		selecionados = [...f.escalados];
	}

	function alternarDepartamento(membros: Colaborador[]) {
		const ids = membros.map((c) => c.id);
		const todos = ids.every((id) => selecionados.includes(id));
		selecionados = todos
			? selecionados.filter((id) => !ids.includes(id))
			: [...new Set([...selecionados, ...ids])];
	}

	async function salvarEscala() {
		if (!alvo) return;
		saving = true;
		errorMsg = '';
		try {
			await feriadoService.definirEscala(alvo.data, selecionados);
			alvo = null;
			await carregar();
		} catch (e) {
			const err = e as { details?: { error?: string } };
			errorMsg = err.details?.error ?? 'Erro ao salvar a escala.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Feriados — On Time</title>
</svelte:head>

<section class="admin-page">
	<header class="admin-page__header">
		<h1>Feriados</h1>
		<div class="ano">
			<Button variant="outline" size="sm" onclick={() => ano--}>‹ {ano - 1}</Button>
			<strong>{ano}</strong>
			<Button variant="outline" size="sm" onclick={() => ano++}>{ano + 1} ›</Button>
		</div>
	</header>

	<p class="hint">
		No feriado ou ponto facultativo, quem não está na escala não tem expediente: não leva falta nem
		déficit, e o que trabalhar conta como extra. Quem está escalado segue a própria jornada —
		trabalhar num feriado fica registrado como feriado trabalhado; num ponto facultativo, é um dia
		comum.
	</p>

	{#if errorMsg}
		<div class="alert alert--error" role="alert">{errorMsg}</div>
	{/if}

	<form
		class="form"
		onsubmit={(e) => {
			e.preventDefault();
			adicionar();
		}}
	>
		<div class="field">
			<label for="feriado-data">Data</label>
			<input id="feriado-data" type="date" bind:value={form.data} required />
		</div>
		<div class="field field--nome">
			<label for="feriado-nome">Nome</label>
			<input
				id="feriado-nome"
				type="text"
				bind:value={form.nome}
				placeholder="Ex: Aniversário da cidade"
				required
			/>
		</div>
		<div class="field">
			<label for="feriado-tipo">Tipo</label>
			<select
				id="feriado-tipo"
				bind:value={form.tipo}
				onchange={() => {
					if (form.tipo === 'feriado' && form.abrangencia === 'nacional')
						form.abrangencia = 'municipal';
				}}
			>
				<option value="feriado">Feriado</option>
				<option value="ponto_facultativo">Ponto facultativo</option>
			</select>
		</div>
		<div class="field">
			<label for="feriado-abrangencia">Abrangência</label>
			<select id="feriado-abrangencia" bind:value={form.abrangencia}>
				<option value="municipal">Municipal</option>
				<option value="estadual">Estadual</option>
				<!-- Feriado nacional vem da lei; ponto facultativo nacional (Carnaval) se cadastra. -->
				{#if form.tipo === 'ponto_facultativo'}
					<option value="nacional">Nacional</option>
				{/if}
			</select>
		</div>
		<Button variant="primary" type="submit" loading={saving}>Adicionar</Button>
	</form>

	{#if dados && dados.sugestoes.length > 0}
		<div class="sugestoes">
			<span class="hint">Datas móveis de {ano} (preenchem o formulário para você ajustar):</span>
			{#each dados.sugestoes as s (s.data)}
				<Button variant="outline" size="sm" onclick={() => usarSugestao(s)}>
					{s.nome} · {formatarData(s.data).slice(0, 5)}
				</Button>
			{/each}
		</div>
	{/if}

	{#if loading && !dados}
		<p class="empty">Carregando...</p>
	{:else if dados}
		<ul class="lista">
			{#each dados.feriados as f (f.data)}
				<li class="item">
					<span class="item__data">{formatarData(f.data)}</span>
					<span class="item__nome">{f.nome}</span>
					<span class="item__tags">
						<Badge variant={f.tipo === 'feriado' ? 'primary' : 'info'}>{ROTULO_TIPO[f.tipo]}</Badge>
						<Badge variant="neutral">{ROTULO_ABRANGENCIA[f.abrangencia]}</Badge>
					</span>
					<span class="item__acoes">
						<Button variant="outline" size="sm" onclick={() => abrirEscala(f)}>
							{f.escalados.length === 0 ? 'Fechado' : `Aberto · ${f.escalados.length} na escala`}
						</Button>
						{#if !f.lei && f.id}
							<Button variant="danger" size="sm" onclick={() => remover(f.id!)}>Excluir</Button>
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

{#if alvo}
	<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="escala-titulo">
		<div class="modal">
			<div class="modal__header">
				<div>
					<h2 class="modal__title" id="escala-titulo">Quem trabalha em {alvo.nome}?</h2>
					<p class="hint">{formatarData(alvo.data)} · {ROTULO_TIPO[alvo.tipo]}</p>
				</div>
				<button type="button" class="modal__close" onclick={() => (alvo = null)} aria-label="Fechar"
					>&times;</button
				>
			</div>

			<div class="modal__body">
				<p class="hint">
					Ninguém marcado = empresa fechada. Os escalados seguem a jornada normal e levam falta se
					não vierem.
				</p>
				{#each porDepartamento as [departamento, membros] (departamento)}
					{@const marcados = membros.filter((c) => selecionados.includes(c.id)).length}
					<fieldset class="grupo">
						<legend>
							<label class="check check--grupo">
								<input
									type="checkbox"
									checked={marcados === membros.length}
									indeterminate={marcados > 0 && marcados < membros.length}
									onchange={() => alternarDepartamento(membros)}
								/>
								{departamento}
								<span class="hint">({marcados}/{membros.length})</span>
							</label>
						</legend>
						{#each membros as c (c.id)}
							<label class="check">
								<input type="checkbox" value={c.id} bind:group={selecionados} />
								{c.nome}
								{#if c.cargo}<span class="hint">· {c.cargo}</span>{/if}
							</label>
						{/each}
					</fieldset>
				{/each}
			</div>

			<div class="modal__footer">
				<span class="hint">{selecionados.length} na escala</span>
				<div class="modal__footer-spacer"></div>
				<Button variant="outline" onclick={() => (selecionados = [])}>Limpar</Button>
				<Button variant="primary" loading={saving} onclick={salvarEscala}>Salvar escala</Button>
			</div>
		</div>
	</div>
{/if}

<style>
	.ano {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 1rem;
	}

	.hint {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	.alert {
		padding: 0.75rem 1rem;
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
	}

	.alert--error {
		background: var(--color-danger-bg);
		color: var(--color-danger);
	}

	.empty {
		text-align: center;
		color: var(--color-text-subtle);
		padding: 4rem 2rem;
	}

	.form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.75rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 1rem 1.25rem;
		box-shadow: var(--shadow-card);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.field--nome {
		flex: 1;
		min-width: 200px;
	}

	.field label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.field input,
	.field select {
		border: 1.5px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		padding: 0.5rem 0.75rem;
		font-size: 0.9rem;
		outline: none;
		background: var(--color-surface);
		color: var(--color-text);
	}

	.field input:focus,
	.field select:focus {
		border-color: var(--color-primary);
	}

	.sugestoes {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.lista {
		list-style: none;
		margin: 0;
		padding: 0;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-card);
	}

	.item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1.25rem;
		border-bottom: 1px solid var(--color-border);
		min-height: 3rem;
	}

	.item:last-child {
		border-bottom: none;
	}

	.item__data {
		font-variant-numeric: tabular-nums;
		color: var(--color-text-muted);
		font-size: 0.875rem;
		min-width: 8.5rem;
	}

	.item__nome {
		flex: 1;
		color: var(--color-text);
		font-weight: 600;
	}

	.item__tags,
	.item__acoes {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}

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
		border-radius: var(--radius-md);
		width: 100%;
		max-width: 520px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
	}

	.modal__header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.modal__title {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--color-text);
	}

	.modal__close {
		background: none;
		border: none;
		font-size: 1.5rem;
		line-height: 1;
		color: var(--color-text-muted);
		cursor: pointer;
		padding: 0.25rem;
	}

	.modal__body {
		padding: 1rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		overflow-y: auto;
	}

	.modal__footer {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem 1.5rem;
		border-top: 1px solid var(--color-border);
	}

	.modal__footer-spacer {
		flex: 1;
	}

	.grupo {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: 0.5rem 0.75rem 0.75rem;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: var(--color-text);
		cursor: pointer;
	}

	.check--grupo {
		font-weight: 700;
	}

	@media (max-width: 640px) {
		.item {
			flex-wrap: wrap;
		}

		.item__nome {
			flex-basis: 100%;
			order: -1;
		}
	}
</style>
