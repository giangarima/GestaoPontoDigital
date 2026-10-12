<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '@/components/ui/Button.svelte';
	import { jornadaService } from '@/services/jornada.service';
	import type { Jornada, JornadaInput, DiaSemana, DiaSemanaKey } from '@/services/jornada.service';

	// ── Configuração dos dias ──────────────────────────────────
	const DIAS_CONFIG: { key: DiaSemanaKey; label: string; abrev: string }[] = [
		{ key: 'segunda', label: 'Segunda-feira', abrev: 'Seg' },
		{ key: 'terca', label: 'Terça-feira', abrev: 'Ter' },
		{ key: 'quarta', label: 'Quarta-feira', abrev: 'Qua' },
		{ key: 'quinta', label: 'Quinta-feira', abrev: 'Qui' },
		{ key: 'sexta', label: 'Sexta-feira', abrev: 'Sex' },
		{ key: 'sabado', label: 'Sábado', abrev: 'Sáb' },
		{ key: 'domingo', label: 'Domingo', abrev: 'Dom' }
	];

	// ── Helpers ────────────────────────────────────────────────
	function calcMinutes(start: string, end: string): number {
		const [sh, sm] = start.split(':').map(Number);
		const [eh, em] = end.split(':').map(Number);
		return eh * 60 + em - (sh * 60 + sm);
	}

	function formatMinutes(minutes: number): string {
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		return `${h}h ${String(m).padStart(2, '0')}min`;
	}

	function toIsoDate(d: Date): string {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${y}-${m}-${day}`;
	}

	function hojeStr(): string {
		return toIsoDate(new Date());
	}

	function amanhaStr(): string {
		const h = new Date();
		return toIsoDate(new Date(h.getFullYear(), h.getMonth(), h.getDate() + 1));
	}

	function formatarDataBR(iso: string): string {
		const [y, m, d] = iso.split('-');
		return `${d}/${m}/${y}`;
	}

	function diaPadrao(ativo: boolean): DiaSemana {
		return { ativo, entrada: '', saida_almoco: '', retorno_almoco: '', saida: '' };
	}

	function diasPadrao(): Record<DiaSemanaKey, DiaSemana> {
		return {
			segunda: diaPadrao(true),
			terca: diaPadrao(true),
			quarta: diaPadrao(true),
			quinta: diaPadrao(true),
			sexta: diaPadrao(true),
			sabado: diaPadrao(false),
			domingo: diaPadrao(false)
		};
	}

	// ── Estado principal ───────────────────────────────────────
	let jornadas = $state<Jornada[]>([]);
	let loading = $state(false);
	let errorMsg = $state('');

	// ── Estado do modal ────────────────────────────────────────
	let modalOpen = $state(false);
	let editingId = $state<string | null>(null);
	let saving = $state(false);
	let deleteConfirmId = $state<string | null>(null);

	// ── Campos do formulário ───────────────────────────────────
	let formNome = $state('');
	let formVigenciaInicio = $state('');
	let mesmoHorario = $state(true);
	let horarioUnico = $state({ entrada: '', saida_almoco: '', retorno_almoco: '', saida: '' });
	let formDias = $state<Record<DiaSemanaKey, DiaSemana>>(diasPadrao());
	let errors = $state<Record<string, string>>({});

	// ── Derivados ──────────────────────────────────────────────
	let jornadasComCalculo = $derived.by(() =>
		jornadas.map((j) => {
			const diasAtivos = DIAS_CONFIG.filter((d) => j.dias[d.key].ativo);
			const minutosPorDia = diasAtivos.map((d) => {
				const dia = j.dias[d.key];
				return (
					calcMinutes(dia.entrada, dia.saida) - calcMinutes(dia.saida_almoco, dia.retorno_almoco)
				);
			});
			const totalSemana = minutosPorDia.reduce((a, b) => a + b, 0);
			// Menor data de vigência futura (versão agendada que ainda não vale hoje).
			const hoje = hojeStr();
			const proximaVigencia = j.versoes
				.map((v) => v.vigenciaInicio)
				.filter((d) => d > hoje)
				.sort()[0];
			return { ...j, quantidadeDias: diasAtivos.length, totalSemana, proximaVigencia };
		})
	);

	let previewUnico = $derived.by(() => {
		if (!mesmoHorario) return null;
		const h = horarioUnico;
		if (!h.entrada || !h.saida_almoco || !h.retorno_almoco || !h.saida) return null;
		const total = calcMinutes(h.entrada, h.saida) - calcMinutes(h.saida_almoco, h.retorno_almoco);
		const almoco = calcMinutes(h.saida_almoco, h.retorno_almoco);
		if (total <= 0 || almoco <= 0) return null;
		return { total, almoco };
	});

	// ── Validação ──────────────────────────────────────────────
	function validarHorarioDia(
		h: { entrada: string; saida_almoco: string; retorno_almoco: string; saida: string },
		prefix: string
	): Record<string, string> {
		const e: Record<string, string> = {};
		if (!h.entrada) e[`${prefix}_entrada`] = 'Obrigatório';
		if (!h.saida_almoco) e[`${prefix}_saida_almoco`] = 'Obrigatório';
		if (!h.retorno_almoco) e[`${prefix}_retorno_almoco`] = 'Obrigatório';
		if (!h.saida) e[`${prefix}_saida`] = 'Obrigatório';

		if (h.entrada && h.saida_almoco && h.retorno_almoco && h.saida) {
			const toMin = (t: string) => {
				const [hh, mm] = t.split(':').map(Number);
				return hh * 60 + mm;
			};
			const [e1, e2, e3, e4] = [h.entrada, h.saida_almoco, h.retorno_almoco, h.saida].map(toMin);
			if (e1 >= e2) e[`${prefix}_saida_almoco`] = 'Deve ser depois da entrada';
			if (e2 >= e3) e[`${prefix}_retorno_almoco`] = 'Deve ser depois da saída p/ almoço';
			if (e3 >= e4) e[`${prefix}_saida`] = 'Deve ser depois do retorno';
		}
		return e;
	}

	function validate(): boolean {
		const e: Record<string, string> = {};

		if (!formNome.trim()) e.nome = 'Nome é obrigatório';

		const diasAtivos = DIAS_CONFIG.filter((d) => formDias[d.key].ativo);
		if (diasAtivos.length === 0) e.dias = 'Selecione ao menos um dia da semana';

		if (mesmoHorario) {
			Object.assign(e, validarHorarioDia(horarioUnico, 'horario'));
		} else {
			for (const d of diasAtivos) {
				Object.assign(e, validarHorarioDia(formDias[d.key], d.key));
			}
		}

		errors = e;
		return Object.keys(e).length === 0;
	}

	// ── Ações do formulário ────────────────────────────────────
	function handleToggleMesmoHorario() {
		if (mesmoHorario) {
			// Ao mudar para horários individuais, pré-preenche com os valores do horário único
			for (const d of DIAS_CONFIG) {
				if (formDias[d.key].ativo) {
					formDias[d.key].entrada = horarioUnico.entrada;
					formDias[d.key].saida_almoco = horarioUnico.saida_almoco;
					formDias[d.key].retorno_almoco = horarioUnico.retorno_almoco;
					formDias[d.key].saida = horarioUnico.saida;
				}
			}
		}
		mesmoHorario = !mesmoHorario;
	}

	// ── CRUD ───────────────────────────────────────────────────
	function openCreate() {
		editingId = null;
		formNome = '';
		formVigenciaInicio = hojeStr();
		mesmoHorario = true;
		horarioUnico = { entrada: '', saida_almoco: '', retorno_almoco: '', saida: '' };
		formDias = diasPadrao();
		errors = {};
		modalOpen = true;
	}

	function openEdit(j: Jornada) {
		editingId = j.id;
		formNome = j.nome;
		formVigenciaInicio = amanhaStr();

		// Detecta se todos os dias ativos têm o mesmo horário
		const ativos = DIAS_CONFIG.filter((d) => j.dias[d.key].ativo);
		const todasIguais =
			ativos.length > 0 &&
			ativos.every((d) => {
				const dia = j.dias[d.key];
				const ref = j.dias[ativos[0].key];
				return (
					dia.entrada === ref.entrada &&
					dia.saida_almoco === ref.saida_almoco &&
					dia.retorno_almoco === ref.retorno_almoco &&
					dia.saida === ref.saida
				);
			});

		mesmoHorario = todasIguais;
		if (todasIguais && ativos.length > 0) {
			const ref = j.dias[ativos[0].key];
			horarioUnico = {
				entrada: ref.entrada,
				saida_almoco: ref.saida_almoco,
				retorno_almoco: ref.retorno_almoco,
				saida: ref.saida
			};
		} else {
			horarioUnico = { entrada: '', saida_almoco: '', retorno_almoco: '', saida: '' };
		}

		for (const d of DIAS_CONFIG) {
			formDias[d.key] = { ...j.dias[d.key] };
		}

		errors = {};
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		editingId = null;
		deleteConfirmId = null;
	}

	async function handleDeleteFromModal() {
		if (!editingId) return;
		await handleDelete(editingId);
		if (!errorMsg) closeModal();
	}

	async function handleSave() {
		if (!validate()) return;

		// Vigência hoje ou no passado pode reescrever dias já batidos → confirmar.
		if (editingId && formVigenciaInicio <= hojeStr()) {
			const ok = window.confirm(
				`O novo horário passa a valer em ${formatarDataBR(formVigenciaInicio)}. ` +
					'Dias com registros de ponto nessa data em diante terão a classificação ' +
					'(pontual/atraso/falta) recalculada. Deseja continuar?'
			);
			if (!ok) return;
		}

		saving = true;
		errorMsg = '';

		const diasFinal = {} as Record<DiaSemanaKey, DiaSemana>;
		for (const d of DIAS_CONFIG) {
			if (!formDias[d.key].ativo) {
				diasFinal[d.key] = diaPadrao(false);
			} else if (mesmoHorario) {
				diasFinal[d.key] = { ativo: true, ...horarioUnico };
			} else {
				diasFinal[d.key] = { ...formDias[d.key] };
			}
		}

		const data: JornadaInput = {
			nome: formNome.trim(),
			dias: diasFinal,
			vigenciaInicio: formVigenciaInicio
		};
		try {
			if (editingId) {
				const updated = await jornadaService.update(editingId, data);
				jornadas = jornadas.map((j) => (j.id === editingId ? updated : j));
			} else {
				const created = await jornadaService.create(data);
				jornadas = [...jornadas, created];
			}
			closeModal();
		} catch {
			errorMsg = 'Erro ao salvar jornada. Tente novamente.';
		} finally {
			saving = false;
		}
	}

	async function handleDelete(id: string) {
		errorMsg = '';
		try {
			await jornadaService.remove(id);
			jornadas = jornadas.filter((j) => j.id !== id);
			deleteConfirmId = null;
		} catch {
			errorMsg = 'Erro ao excluir jornada. Tente novamente.';
		}
	}

	onMount(async () => {
		loading = true;
		try {
			jornadas = await jornadaService.list();
		} catch {
			errorMsg = 'Erro ao carregar jornadas.';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>Jornadas</title>
</svelte:head>

<section class="admin-page">
	<header class="admin-page__header">
		<h1>Jornadas de Trabalho</h1>
		<Button onclick={openCreate}>Nova Jornada</Button>
	</header>

	{#if errorMsg}
		<div class="jornadas__error" role="alert">{errorMsg}</div>
	{/if}

	{#if loading}
		<p class="jornadas__empty">Carregando...</p>
	{:else if jornadasComCalculo.length === 0}
		<p class="jornadas__empty">Nenhuma jornada cadastrada.</p>
	{:else}
		<div class="jornadas__grid">
			{#each jornadasComCalculo as j (j.id)}
				<div class="jornada-card">
					<div class="jornada-card__header">
						<span class="jornada-card__nome">{j.nome}</span>
						<div class="jornada-card__actions">
							<Button variant="outline" size="sm" onclick={() => openEdit(j)}>Editar</Button>
						</div>
					</div>

					<div class="jornada-card__dias">
						{#each DIAS_CONFIG as d (d)}
							{@const diaInfo = j.dias[d.key]}
							<div class="dia-row" class:dia-row--folga={!diaInfo.ativo}>
								<span class="dia-row__abrev">{d.abrev}</span>
								{#if diaInfo.ativo}
									<span class="dia-row__horario">
										{diaInfo.entrada}–{diaInfo.saida_almoco}
										<span class="dia-row__sep">|</span>
										{diaInfo.retorno_almoco}–{diaInfo.saida}
									</span>
									<span class="dia-row__total">
										{formatMinutes(
											calcMinutes(diaInfo.entrada, diaInfo.saida) -
												calcMinutes(diaInfo.saida_almoco, diaInfo.retorno_almoco)
										)}
									</span>
								{:else}
									<span class="dia-row__folga-label">Folga</span>
								{/if}
							</div>
						{/each}
					</div>

					<div class="jornada-card__footer">
						<span class="badge badge--blue">{j.quantidadeDias} dias/semana</span>
						<span class="badge badge--muted">{formatMinutes(j.totalSemana)}/semana</span>
					</div>

					{#if j.proximaVigencia}
						<p class="jornada-card__pendente">
							Novo horário a partir de {formatarDataBR(j.proximaVigencia)}
						</p>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</section>

<!-- ── Modal ──────────────────────────────────────────────── -->
{#if modalOpen}
	<div
		class="modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-label={editingId ? 'Editar jornada' : 'Nova jornada'}
	>
		<div class="modal">
			<div class="modal__header">
				<h2 class="modal__title">{editingId ? 'Editar Jornada' : 'Nova Jornada'}</h2>
				<button type="button" class="modal__close" onclick={closeModal} aria-label="Fechar"
					>&times;</button
				>
			</div>

			<form
				class="modal__body"
				onsubmit={(e) => {
					e.preventDefault();
					handleSave();
				}}
			>
				{#if editingId}
					<!-- Vigência: a pessoa decide quando o novo horário passa a valer -->
					<div class="field">
						<label for="vigencia">Vigente a partir de</label>
						<input id="vigencia" type="date" bind:value={formVigenciaInicio} min={hojeStr()} />
						<span class="field__hint">
							{#if formVigenciaInicio > hojeStr()}
								O horário atual continua até lá; o novo passa a valer em {formatarDataBR(
									formVigenciaInicio
								)}. O histórico anterior é preservado.
							{:else}
								Passa a valer já hoje. Dias com registros terão a classificação
								(pontual/atraso/falta) recalculada.
							{/if}
						</span>
					</div>
				{/if}

				<!-- Nome -->
				<div class="field" class:field--error={!!errors.nome}>
					<label for="nome">Nome da Jornada</label>
					<input id="nome" type="text" bind:value={formNome} placeholder="Ex: Comercial 8h" />
					{#if errors.nome}<span class="field__error">{errors.nome}</span>{/if}
				</div>

				<!-- Toggle: mesmo horário -->
				<label class="toggle-row">
					<input
						type="checkbox"
						class="toggle-row__check"
						checked={mesmoHorario}
						onchange={handleToggleMesmoHorario}
					/>
					<span class="toggle-row__label">Mesmo horário para todos os dias ativos</span>
				</label>

				{#if mesmoHorario}
					<!-- Horário único -->
					<div class="horario-unico">
						<div class="time-grid">
							<div class="field" class:field--error={!!errors.horario_entrada}>
								<label for="h_entrada">Entrada</label>
								<input id="h_entrada" type="time" bind:value={horarioUnico.entrada} />
								{#if errors.horario_entrada}<span class="field__error"
										>{errors.horario_entrada}</span
									>{/if}
							</div>
							<div class="field" class:field--error={!!errors.horario_saida_almoco}>
								<label for="h_saida_alm">Saída Almoço</label>
								<input id="h_saida_alm" type="time" bind:value={horarioUnico.saida_almoco} />
								{#if errors.horario_saida_almoco}<span class="field__error"
										>{errors.horario_saida_almoco}</span
									>{/if}
							</div>
							<div class="field" class:field--error={!!errors.horario_retorno_almoco}>
								<label for="h_retorno">Retorno Almoço</label>
								<input id="h_retorno" type="time" bind:value={horarioUnico.retorno_almoco} />
								{#if errors.horario_retorno_almoco}<span class="field__error"
										>{errors.horario_retorno_almoco}</span
									>{/if}
							</div>
							<div class="field" class:field--error={!!errors.horario_saida}>
								<label for="h_saida">Saída</label>
								<input id="h_saida" type="time" bind:value={horarioUnico.saida} />
								{#if errors.horario_saida}<span class="field__error">{errors.horario_saida}</span
									>{/if}
							</div>
						</div>

						{#if previewUnico}
							<div class="preview-bar">
								<span>Total: <strong>{formatMinutes(previewUnico.total)}</strong></span>
								<span>Almoço: <strong>{formatMinutes(previewUnico.almoco)}</strong></span>
							</div>
						{/if}
					</div>

					<!-- Dias ativos (checkboxes compactos) -->
					<div class="section-label">Dias ativos</div>
					{#if errors.dias}<p class="field__error">{errors.dias}</p>{/if}
					<div class="dias-chips">
						{#each DIAS_CONFIG as d (d)}
							<label class="dia-chip" class:dia-chip--ativo={formDias[d.key].ativo}>
								<input
									type="checkbox"
									checked={formDias[d.key].ativo}
									onchange={() => (formDias[d.key].ativo = !formDias[d.key].ativo)}
								/>
								{d.abrev}
							</label>
						{/each}
					</div>
				{:else}
					<!-- Horários individuais por dia -->
					{#if errors.dias}<p class="field__error">{errors.dias}</p>{/if}
					<div class="dias-individuais">
						{#each DIAS_CONFIG as d (d)}
							<div class="dia-bloco" class:dia-bloco--inativo={!formDias[d.key].ativo}>
								<label class="dia-bloco__toggle">
									<input
										type="checkbox"
										checked={formDias[d.key].ativo}
										onchange={() => (formDias[d.key].ativo = !formDias[d.key].ativo)}
									/>
									<span class="dia-bloco__nome">{d.label}</span>
								</label>

								{#if formDias[d.key].ativo}
									<div class="time-grid dia-bloco__horarios">
										<div class="field" class:field--error={!!errors[`${d.key}_entrada`]}>
											<label for={`${d.key}_entrada`}>Entrada</label>
											<input
												id={`${d.key}_entrada`}
												type="time"
												value={formDias[d.key].entrada}
												oninput={(e) => {
													formDias[d.key].entrada = e.currentTarget.value;
												}}
											/>
											{#if errors[`${d.key}_entrada`]}<span class="field__error"
													>{errors[`${d.key}_entrada`]}</span
												>{/if}
										</div>
										<div class="field" class:field--error={!!errors[`${d.key}_saida_almoco`]}>
											<label for={`${d.key}_saida_alm`}>Saída Almoço</label>
											<input
												id={`${d.key}_saida_alm`}
												type="time"
												value={formDias[d.key].saida_almoco}
												oninput={(e) => {
													formDias[d.key].saida_almoco = e.currentTarget.value;
												}}
											/>
											{#if errors[`${d.key}_saida_almoco`]}<span class="field__error"
													>{errors[`${d.key}_saida_almoco`]}</span
												>{/if}
										</div>
										<div class="field" class:field--error={!!errors[`${d.key}_retorno_almoco`]}>
											<label for={`${d.key}_retorno`}>Retorno Almoço</label>
											<input
												id={`${d.key}_retorno`}
												type="time"
												value={formDias[d.key].retorno_almoco}
												oninput={(e) => {
													formDias[d.key].retorno_almoco = e.currentTarget.value;
												}}
											/>
											{#if errors[`${d.key}_retorno_almoco`]}<span class="field__error"
													>{errors[`${d.key}_retorno_almoco`]}</span
												>{/if}
										</div>
										<div class="field" class:field--error={!!errors[`${d.key}_saida`]}>
											<label for={`${d.key}_saida`}>Saída</label>
											<input
												id={`${d.key}_saida`}
												type="time"
												value={formDias[d.key].saida}
												oninput={(e) => {
													formDias[d.key].saida = e.currentTarget.value;
												}}
											/>
											{#if errors[`${d.key}_saida`]}<span class="field__error"
													>{errors[`${d.key}_saida`]}</span
												>{/if}
										</div>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}

				<div class="modal__footer">
					{#if editingId}
						{#if deleteConfirmId === editingId}
							<Button variant="danger" size="sm" onclick={handleDeleteFromModal}
								>Confirmar exclusão</Button
							>
							<Button variant="secondary" size="sm" onclick={() => (deleteConfirmId = null)}
								>Cancelar</Button
							>
						{:else}
							<Button variant="danger" size="sm" onclick={() => (deleteConfirmId = editingId)}
								>Excluir</Button
							>
						{/if}
					{/if}
					<div class="modal__footer-spacer"></div>
					<Button variant="outline" onclick={closeModal}>Cancelar</Button>
					<Button variant="primary" type="submit" loading={saving}>
						{editingId ? 'Salvar Alterações' : 'Criar Jornada'}
					</Button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	/* ── Página ─────────────────────────────────────────────── */
	.jornadas__error {
		background: var(--color-danger-bg);
		color: var(--color-danger);
		padding: 0.75rem 1rem;
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
	}

	.jornadas__empty {
		text-align: center;
		color: var(--color-text-subtle);
		padding: 4rem 2rem;
	}

	/* ── Grid de cards ──────────────────────────────────────── */
	.jornadas__grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1rem;
	}

	/* ── Card ───────────────────────────────────────────────── */
	.jornada-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 1.25rem;
		box-shadow: var(--shadow-card);
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.jornada-card__header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.jornada-card__nome {
		font-weight: 700;
		color: var(--color-text);
		font-size: 1rem;
		line-height: 1.3;
	}

	.jornada-card__actions {
		display: flex;
		gap: 0.375rem;
		flex-shrink: 0;
	}

	/* ── Tabela de dias no card ─────────────────────────────── */
	.jornada-card__dias {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.dia-row {
		display: grid;
		grid-template-columns: 2.5rem 1fr auto;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		padding: 0.25rem 0;
	}

	.dia-row--folga {
		opacity: 0.4;
	}

	.dia-row__abrev {
		font-weight: 700;
		color: var(--color-text-secondary);
		font-size: 0.75rem;
	}

	.dia-row__horario {
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}

	.dia-row__sep {
		color: var(--color-text-subtle);
		margin: 0 0.25rem;
	}

	.dia-row__total {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--color-primary);
		background: var(--color-primary-soft);
		padding: 0.125rem 0.4rem;
		border-radius: 999px;
		white-space: nowrap;
	}

	.dia-row__folga-label {
		color: var(--color-text-subtle);
		font-size: 0.75rem;
		grid-column: 2 / -1;
	}

	/* ── Footer do card ─────────────────────────────────────── */
	.jornada-card__footer {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding-top: 0.25rem;
		border-top: 1px solid var(--color-hover);
	}

	.jornada-card__pendente {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-primary);
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.jornada-card__pendente::before {
		content: '';
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--color-primary);
	}

	.badge {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.25rem 0.625rem;
		border-radius: 999px;
	}

	.badge--blue {
		background: var(--color-primary-soft);
		color: var(--color-primary);
	}
	.badge--muted {
		background: var(--color-bg);
		color: var(--color-text-muted);
	}

	/* ── Modal ──────────────────────────────────────────────── */
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
		align-items: center;
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
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
		border-radius: 0.25rem;
	}

	.modal__close:hover {
		color: var(--color-text);
		background: var(--color-bg);
	}

	.modal__body {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		overflow-y: auto;
		flex: 1;
	}

	.modal__footer {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-top: 1rem;
		margin-top: auto;
		border-top: 1px solid var(--color-border);
	}

	.modal__footer-spacer {
		flex: 1;
	}

	/* ── Campos ─────────────────────────────────────────────── */
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.field label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.field input[type='text'],
	.field input[type='time'],
	.field input[type='date'] {
		border: 1.5px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		padding: 0.5rem 0.75rem;
		font-size: 0.9rem;
		outline: none;
		transition: border-color 150ms;
		color: var(--color-text);
		background: var(--color-surface);
	}

	.field input:focus {
		border-color: var(--color-primary);
	}

	.field--error input {
		border-color: var(--color-danger);
	}

	.field__error {
		font-size: 0.75rem;
		color: var(--color-danger);
	}

	.field__hint {
		font-size: 0.75rem;
		line-height: 1.4;
		color: var(--color-text-muted);
	}

	.time-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.625rem;
	}

	/* ── Toggle mesmo horário ───────────────────────────────── */
	.toggle-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		user-select: none;
	}

	.toggle-row__check {
		width: 1rem;
		height: 1rem;
		accent-color: var(--color-primary);
		cursor: pointer;
		flex-shrink: 0;
	}

	.toggle-row__label {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	/* ── Horário único ──────────────────────────────────────── */
	.horario-unico {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		background: var(--color-surface-muted);
		border-radius: var(--radius-sm);
		padding: 1rem;
	}

	.preview-bar {
		display: flex;
		gap: 1.5rem;
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}

	.preview-bar strong {
		color: var(--color-text);
	}

	/* ── Label de seção ─────────────────────────────────────── */
	.section-label {
		font-size: 0.8rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-subtle);
	}

	/* ── Chips de dias ──────────────────────────────────────── */
	.dias-chips {
		display: flex;
		gap: 0.375rem;
		flex-wrap: wrap;
	}

	.dia-chip {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.375rem 0.75rem;
		border-radius: 999px;
		border: 1px solid var(--color-border);
		background: var(--color-surface-muted);
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-muted);
		cursor: pointer;
		user-select: none;
		transition: all 150ms;
	}

	.dia-chip input[type='checkbox'] {
		display: none;
	}

	.dia-chip--ativo {
		background: var(--color-primary-soft);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	/* ── Blocos de dia individual ───────────────────────────── */
	.dias-individuais {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.dia-bloco {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.dia-bloco--inativo {
		opacity: 0.6;
	}

	.dia-bloco__toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 0.875rem;
		cursor: pointer;
		background: var(--color-surface-muted);
		user-select: none;
	}

	.dia-bloco__toggle input[type='checkbox'] {
		width: 1rem;
		height: 1rem;
		accent-color: var(--color-primary);
		cursor: pointer;
		flex-shrink: 0;
	}

	.dia-bloco__nome {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.dia-bloco__horarios {
		padding: 0.875rem;
		background: var(--color-surface);
	}
</style>
