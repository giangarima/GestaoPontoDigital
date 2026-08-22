<!--
  @page /admin/empresa
  @description Dados da empresa (nome, CNPJ, horários).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { empresaService, type Empresa } from '@/services/empresa.service';
	import { user as userStore } from '@/store/auth.store';
	import { get } from 'svelte/store';
	import Button from '@/components/ui/Button.svelte';

	let empresa = $state<Empresa | null>(null);
	let salvando = $state(false);
	let errorMsg = $state('');

	let form = $state({
		nome: '',
		cnpj: '',
		razaoSocial: '',
		caepfCno: '',
		localPrestacao: '',
		horaAbertura: '',
		horaFechamento: ''
	});

	async function loadEmpresa() {
		const user = get(userStore);
		if (!user) return;
		empresa = await empresaService.get(user.empresaId);
		form = {
			nome: empresa.nome,
			cnpj: empresa.cnpj ?? '',
			razaoSocial: empresa.razaoSocial ?? '',
			caepfCno: empresa.caepfCno ?? '',
			localPrestacao: empresa.localPrestacao ?? '',
			horaAbertura: empresa.horaAbertura,
			horaFechamento: empresa.horaFechamento
		};
	}

	async function salvar() {
		if (!empresa) return;
		salvando = true;
		errorMsg = '';
		try {
			empresa = await empresaService.update(empresa.id, {
				nome: form.nome,
				cnpj: form.cnpj || undefined,
				razaoSocial: form.razaoSocial || undefined,
				caepfCno: form.caepfCno || undefined,
				localPrestacao: form.localPrestacao || undefined,
				horaAbertura: form.horaAbertura,
				horaFechamento: form.horaFechamento
			});
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Erro ao salvar.';
		} finally {
			salvando = false;
		}
	}

	onMount(loadEmpresa);
</script>

<svelte:head><title>Empresa — Admin</title></svelte:head>

<section class="admin-page">
	<h1>Empresa</h1>

	{#if errorMsg}<div class="error">{errorMsg}</div>{/if}

	<div class="grid">
		<div class="card">
			<h2>Dados e horários</h2>
			<label>Nome<input bind:value={form.nome} /></label>
			<label>Razão social<input bind:value={form.razaoSocial} /></label>
			<label>CNPJ<input bind:value={form.cnpj} /></label>
			<label>CAEPF/CNO<input bind:value={form.caepfCno} /></label>
			<label>Local de prestação de serviços<input bind:value={form.localPrestacao} /></label>
			<div class="row">
				<label>Abertura<input type="time" bind:value={form.horaAbertura} /></label>
				<label>Fechamento<input type="time" bind:value={form.horaFechamento} /></label>
			</div>
			<Button disabled={salvando} onclick={salvar}>
				{salvando ? 'Salvando…' : 'Salvar'}
			</Button>
		</div>
	</div>
</section>

<style>
	.grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1.5rem;
		max-width: 600px;
	}
	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 1.5rem;
	}
	label {
		display: block;
		margin-bottom: 0.75rem;
		font-size: 0.875rem;
		color: #475569;
	}
	input {
		display: block;
		width: 100%;
		margin-top: 0.25rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.9rem;
	}
	.row {
		display: flex;
		gap: 0.75rem;
	}
	.row label {
		flex: 1;
	}
	.error {
		background: var(--color-danger-bg);
		color: var(--color-danger);
		padding: 0.75rem;
		border-radius: var(--radius-sm);
		margin-bottom: 1rem;
	}
</style>
