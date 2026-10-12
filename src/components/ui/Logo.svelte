<!--
  @component Logo
-->
<script lang="ts">
	interface Props {
		size?: 'sm' | 'md' | 'lg';
		dark?: boolean;
	}

	let { size = 'md', dark = false }: Props = $props();

	const dims = {
		sm: { box: 28, icon: 14, font: '0.9375rem', radius: '7px' },
		md: { box: 32, icon: 16, font: '0.9375rem', radius: '8px' },
		lg: { box: 38, icon: 22, font: '1.125rem', radius: '10px' }
	} as const;

	const d = $derived(dims[size]);
</script>

<div class="logo">
	<div class="logo__icon" style="width: {d.box}px; height: {d.box}px; border-radius: {d.radius};">
		<svg width={d.icon} height={d.icon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<circle cx="12" cy="12" r="9" stroke="white" stroke-width="2" />
			<polyline points="12,7 12,12 15,15" stroke="white" stroke-width="2" stroke-linecap="round" />
		</svg>
	</div>
	<span class="logo__text" class:logo__text--dark={dark} style="font-size: {d.font};">
		On Time
	</span>
</div>

<style>
	.logo {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}

	.logo__icon {
		background: var(--color-primary);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.logo__text {
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--color-text);
	}

	.logo__text--dark {
		color: #f8fafc;
	}
</style>
