<!--
  @component AppShell
  @description Layout principal autenticado: sidebar dark fixa (desktop) +
  topbar e bottom-nav (mobile, < 640px).
-->
<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import { isAdmin, user, clearUser } from '@/store/auth.store';
	import { authService } from '@/services/auth.service';
	import Avatar from '@/components/ui/Avatar.svelte';
	import Icon, { type IconName } from '@/components/ui/Icon.svelte';
	import Logo from '@/components/ui/Logo.svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	type NavItem = { href: string; label: string; icon: IconName; badge?: number };

	const NAV_COLAB: NavItem[] = [
		{ href: resolve('/colaborador/registro', {}), label: 'Registrar Ponto', icon: 'clock' },
		{ href: resolve('/colaborador/historico', {}), label: 'Histórico', icon: 'history' },
		{ href: resolve('/colaborador/justificativas', {}), label: 'Justificativas', icon: 'approval' }
	];

	const NAV_ADMIN: NavItem[] = [
		{ href: resolve('/admin/dashboard', {}), label: 'Dashboard', icon: 'dashboard' },
		{ href: resolve('/admin/empresa', {}), label: 'Empresa', icon: 'building' },
		{ href: resolve('/admin/colaboradores', {}), label: 'Colaboradores', icon: 'users' },
		{ href: resolve('/admin/departamentos', {}), label: 'Departamentos', icon: 'handshake' },
		{ href: resolve('/admin/jornadas', {}), label: 'Jornadas', icon: 'clock' },
		{ href: resolve('/admin/justificativas', {}), label: 'Justificativas', icon: 'approval' },
		{ href: resolve('/admin/ferias', {}), label: 'Férias', icon: 'vacations' },
		{ href: resolve('/admin/relatorios', {}), label: 'Relatórios', icon: 'report' },
		{ href: resolve('/admin/pendencias', {}), label: 'Dias em aberto', icon: 'alert' },
		{ href: resolve('/admin/ajustes', {}), label: 'Ajustes', icon: 'check-circle' },
		{ href: resolve('/admin/auditoria', {}), label: 'Auditoria', icon: 'shield' }
	];

	const navItems = $derived($isAdmin ? NAV_ADMIN : NAV_COLAB);

	const initials = $derived(
		$user
			? $user.nome
					.split(' ')
					.filter(Boolean)
					.slice(0, 2)
					.map((p) => p[0])
					.join('')
					.toUpperCase()
			: '?'
	);

	const cargo = $derived($isAdmin ? 'Administrador' : 'Colaborador');

	function isActive(href: string): boolean {
		return page.url.pathname.startsWith(href);
	}

	async function handleLogout(): Promise<void> {
		await authService.logout();
		clearUser();
		await goto(resolve('/auth/login', {}));
	}
</script>

<div class="shell">
	<aside class="sidebar">
		<div class="sidebar__top">
			<div class="sidebar__logo">
				<Logo size="md" dark />
			</div>

			<nav class="sidebar__nav">
				{#each navItems as item (item.href)}
					{@const active = isActive(item.href)}
					<a {...{ href: item.href }} class="nav-item" class:is-active={active}>
						<span class="nav-item__icon">
							<Icon name={item.icon} />
						</span>
						<span class="nav-item__label">{item.label}</span>
						{#if item.badge && !active}
							<span class="nav-item__badge">{item.badge}</span>
						{/if}
					</a>
				{/each}
			</nav>
		</div>

		<div class="sidebar__footer">
			{#if $user}
				<div class="sidebar__user">
					<Avatar {initials} size={34} />
					<div class="sidebar__user-meta">
						<div class="sidebar__user-name">{$user.nome}</div>
						<div class="sidebar__user-cargo">{cargo}</div>
					</div>
				</div>
			{/if}
			<button class="sidebar__logout" onclick={handleLogout}>
				<Icon name="logout" size={14} />
				Sair
			</button>
		</div>
	</aside>

	<div class="main">
		<header class="topbar">
			<Logo size="sm" />
			<Avatar {initials} size={30} />
		</header>

		<main class="content">
			{@render children()}
		</main>
	</div>

	<nav class="bottom-nav" aria-label="Navegação principal">
		{#each navItems as item (item.href)}
			{@const active = isActive(item.href)}
			<a {...{ href: item.href }} class="bottom-nav__item" class:is-active={active}>
				<Icon name={item.icon} size={20} />
				<span>{item.label}</span>
				{#if item.badge}
					<span class="bottom-nav__badge">{item.badge}</span>
				{/if}
			</a>
		{/each}
	</nav>
</div>

<style>
	.shell {
		display: flex;
		min-height: 100vh;
		background: var(--color-bg);
	}

	.sidebar {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		width: var(--sidebar-w);
		background: var(--color-sidebar);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		z-index: 100;
	}

	.sidebar__top {
		padding: 1.25rem 1rem 0.75rem;
	}

	.sidebar__logo {
		margin-bottom: 1.5rem;
	}

	.sidebar__nav {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-radius: var(--radius-sm);
		color: var(--color-sidebar-item-fg);
		text-decoration: none;
		font-size: 0.9375rem;
		font-weight: 400;
		transition: all 0.15s;
	}

	.nav-item__icon {
		display: inline-flex;
		color: var(--color-sidebar-icon);
	}

	.nav-item:hover {
		color: #cbd5e1;
	}

	.nav-item.is-active {
		background: var(--color-sidebar-item-active-bg);
		color: var(--color-sidebar-item-active-fg);
		font-weight: 600;
	}

	.nav-item.is-active .nav-item__icon {
		color: var(--color-sidebar-item-active-fg);
	}

	.nav-item__badge {
		margin-left: auto;
		background: var(--color-danger);
		color: #fff;
		border-radius: var(--radius-pill);
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0.05rem 0.4rem;
		min-width: 18px;
		text-align: center;
	}

	.sidebar__footer {
		padding: 0.75rem 1rem 1.25rem;
		border-top: 1px solid var(--color-sidebar-border);
	}

	.sidebar__user {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		margin-bottom: 0.75rem;
	}

	.sidebar__user-meta {
		min-width: 0;
	}

	.sidebar__user-name {
		color: #f1f5f9;
		font-size: 0.8125rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.sidebar__user-cargo {
		color: #64748b;
		font-size: 0.7rem;
	}

	.sidebar__logout {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #64748b;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.8125rem;
		font-family: inherit;
		padding: 0.375rem 0;
	}

	.sidebar__logout:hover {
		color: #cbd5e1;
	}

	.main {
		flex: 1;
		margin-left: var(--sidebar-w);
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.topbar {
		display: none;
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
		padding: 0.875rem 1rem;
		align-items: center;
		justify-content: space-between;
	}

	.content {
		flex: 1;
		padding: 2rem;
	}

	.bottom-nav {
		display: none;
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: var(--color-surface);
		border-top: 1px solid var(--color-border);
		z-index: 100;
	}

	.bottom-nav__item {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 0.625rem 0;
		color: var(--color-text-subtle);
		text-decoration: none;
		font-size: 0.6875rem;
		font-weight: 400;
		position: relative;
	}

	.bottom-nav__item.is-active {
		color: var(--color-primary);
		font-weight: 600;
	}

	.bottom-nav__badge {
		position: absolute;
		top: 6px;
		right: calc(50% - 16px);
		background: var(--color-danger);
		color: #fff;
		border-radius: var(--radius-pill);
		font-size: 0.6rem;
		font-weight: 700;
		padding: 0.05rem 0.3rem;
	}

	@media (max-width: 639px) {
		.sidebar {
			display: none;
		}
		.main {
			margin-left: 0;
		}
		.topbar {
			display: flex;
		}
		.content {
			padding: 1rem;
			padding-bottom: 5rem;
		}
		.bottom-nav {
			display: flex;
		}
	}
</style>
