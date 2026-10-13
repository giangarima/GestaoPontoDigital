<!--
  @page /admin/empresa
  @description Dados da empresa (nome, CNPJ, horários) e regime do banco de horas.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { empresaService, type Empresa, type RegimeBanco } from '@/services/empresa.service';
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

	let banco = $state({
		regime: 'nenhum' as RegimeBanco,
		inicio: '',
		negativo: 'zerar' as 'zerar' | 'descontar'
	});
	let salvandoBanco = $state(false);
	let bancoMsg = $state('');

	async function salvarBanco() {
		if (!empresa) return;
		salvandoBanco = true;
		errorMsg = '';
		bancoMsg = '';
		try {
			empresa = await empresaService.update(empresa.id, {
				bancoHorasRegime: banco.regime,
				bancoHorasInicio: banco.regime === 'nenhum' ? null : banco.inicio || null,
				bancoHorasNegativo: banco.negativo
			});
			bancoMsg = 'Banco de horas salvo.';
		} catch (e) {
			const err = e as { details?: { error?: string } };
			errorMsg = err.details?.error ?? 'Erro ao salvar o banco de horas.';
		} finally {
			salvandoBanco = false;
		}
	}

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
		banco = {
			regime: empresa.bancoHorasRegime,
			inicio: empresa.bancoHorasInicio?.slice(0, 10) ?? '',
			negativo: empresa.bancoHorasNegativo
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

		<div class="card">
			<h2>Banco de horas</h2>
			<p class="hint">
				Extras viram crédito e atrasos viram débito (faltas ficam de fora). A folga compensatória
				consome saldo. No fim de cada ciclo o saldo vence: o positivo é pago como hora extra.
			</p>
			<label
				>Regime
				<select bind:value={banco.regime}>
					<option value="nenhum">Sem banco de horas</option>
					<option value="mensal">Mensal — compensa no mesmo mês (CLT, art. 59, §6º)</option>
					<option value="semestral">Semestral — acordo individual, até 6 meses (§5º)</option>
					<option value="anual">Anual — convenção ou acordo coletivo, até 12 meses (§2º)</option>
				</select>
			</label>
			{#if banco.regime !== 'nenhum'}
				<label>Início do primeiro ciclo<input type="date" bind:value={banco.inicio} /></label>
				<label
					>Saldo negativo no vencimento
					<select bind:value={banco.negativo}>
						<option value="zerar">Zerar (a empresa assume as horas devidas)</option>
						<option value="descontar">Descontar em folha</option>
					</select>
				</label>
			{/if}
			{#if bancoMsg}<p class="ok" role="status">{bancoMsg}</p>{/if}
			<Button
				disabled={salvandoBanco || (banco.regime !== 'nenhum' && !banco.inicio)}
				onclick={salvarBanco}
			>
				{salvandoBanco ? 'Salvando…' : 'Salvar banco de horas'}
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
		color: var(--color-text-muted);
	}
	input,
	select {
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
	.hint {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0 0 1rem;
	}
	.ok {
		color: var(--color-success-strong);
		font-size: 0.875rem;
		margin: 0 0 0.75rem;
	}
	.error {
		background: var(--color-danger-bg);
		color: var(--color-danger);
		padding: 0.75rem;
		border-radius: var(--radius-sm);
		margin-bottom: 1rem;
	}
</style>
