<script lang="ts">
	/**
	 * Accessible custom dropdown — a styled trigger plus a popover listbox that
	 * opens below, themed with the design tokens (native <select> popups can't be
	 * styled and render light on some platforms). Keyboard-operable (Arrow/Home/
	 * End/Enter/Esc) and closes on outside click. Carries `nodrag`/`nopan` so it
	 * works inside the Svelte Flow node graph without dragging the node.
	 */
	import { tick } from 'svelte';
	import { ChevronDown, Check } from '@lucide/svelte';

	interface Option {
		value: string;
		label: string;
	}
	interface Props {
		value: string;
		options: readonly Option[];
		onchange: (value: string) => void;
		ariaLabel: string;
		/** Shown when `value` matches no option (e.g. an action picker like Presets). */
		placeholder?: string;
	}

	let { value, options, onchange, ariaLabel, placeholder = 'Select…' }: Props = $props();

	let open = $state(false);
	let root = $state<HTMLDivElement | null>(null);
	let trigger = $state<HTMLButtonElement | null>(null);
	let list = $state<HTMLDivElement | null>(null);

	const current = $derived(options.find((o) => o.value === value));

	function optionButtons(): HTMLButtonElement[] {
		return list ? Array.from(list.querySelectorAll<HTMLButtonElement>('[role="option"]')) : [];
	}

	async function openMenu() {
		open = true;
		await tick();
		const i = Math.max(
			0,
			options.findIndex((o) => o.value === value)
		);
		optionButtons()[i]?.focus();
	}

	function closeMenu(focusTrigger = false) {
		open = false;
		if (focusTrigger) trigger?.focus();
	}

	function choose(v: string) {
		onchange(v);
		closeMenu(true);
	}

	function onTriggerKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			openMenu();
		}
	}

	function onListKey(e: KeyboardEvent) {
		const btns = optionButtons();
		const i = btns.indexOf(document.activeElement as HTMLButtonElement);
		if (e.key === 'Escape') {
			e.preventDefault();
			closeMenu(true);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			btns[Math.min(btns.length - 1, i + 1)]?.focus();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			btns[Math.max(0, i - 1)]?.focus();
		} else if (e.key === 'Home') {
			e.preventDefault();
			btns[0]?.focus();
		} else if (e.key === 'End') {
			e.preventDefault();
			btns[btns.length - 1]?.focus();
		} else if (e.key === 'Tab') {
			closeMenu();
		}
	}

	// Close when a pointer lands outside the component.
	$effect(() => {
		if (!open) return;
		const onDown = (e: PointerEvent) => {
			if (root && !root.contains(e.target as Node)) closeMenu();
		};
		window.addEventListener('pointerdown', onDown, true);
		return () => window.removeEventListener('pointerdown', onDown, true);
	});
</script>

<div class="select nodrag nopan" bind:this={root}>
	<button
		type="button"
		class="trigger"
		class:open
		bind:this={trigger}
		aria-label={ariaLabel}
		aria-haspopup="listbox"
		aria-expanded={open}
		onclick={() => (open ? closeMenu() : openMenu())}
		onkeydown={onTriggerKey}
	>
		<span class="label" class:placeholder={!current}>{current?.label ?? placeholder}</span>
		<ChevronDown class="chev" size={15} aria-hidden="true" />
	</button>

	{#if open}
		<div
			class="menu"
			role="listbox"
			aria-label={ariaLabel}
			tabindex="-1"
			bind:this={list}
			onkeydown={onListKey}
		>
			{#each options as o (o.value)}
				{@const selected = o.value === value}
				<button
					type="button"
					class="option"
					class:selected
					role="option"
					aria-selected={selected}
					onclick={() => choose(o.value)}
				>
					<span class="opt-label">{o.label}</span>
					{#if selected}<Check class="tick" size={14} aria-hidden="true" />{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.select {
		position: relative;
		width: 100%;
	}
	.trigger {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--ff-space-2);
		width: 100%;
		height: 30px;
		padding: 0 var(--ff-space-2) 0 var(--ff-space-3);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-md);
		background: var(--ff-surface-raised);
		color: var(--ff-text);
		font-size: var(--ff-text-sm);
		cursor: pointer;
		transition:
			border-color var(--ff-dur-fast) var(--ff-ease),
			background var(--ff-dur-fast) var(--ff-ease);
	}
	.trigger:hover {
		border-color: var(--ff-border-strong);
	}
	.trigger.open {
		border-color: var(--ff-accent);
	}
	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.label.placeholder {
		color: var(--ff-text-muted);
	}
	.trigger :global(.chev) {
		flex: none;
		color: var(--ff-text-muted);
		transition: transform var(--ff-dur-fast) var(--ff-ease);
	}
	.trigger.open :global(.chev) {
		transform: rotate(180deg);
	}

	.menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		z-index: var(--ff-z-overlay);
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: var(--ff-space-1);
		max-height: 280px;
		overflow-y: auto;
		background: var(--ff-surface-overlay);
		border: 1px solid var(--ff-border-strong);
		border-radius: var(--ff-radius-md);
		box-shadow: var(--ff-shadow-2);
	}
	.option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--ff-space-2);
		width: 100%;
		padding: var(--ff-space-2) var(--ff-space-2) var(--ff-space-2) var(--ff-space-3);
		border: none;
		border-radius: var(--ff-radius-sm);
		background: transparent;
		color: var(--ff-text-secondary);
		font-size: var(--ff-text-sm);
		text-align: left;
		cursor: pointer;
		transition:
			background var(--ff-dur-fast) var(--ff-ease),
			color var(--ff-dur-fast) var(--ff-ease);
	}
	.option:hover,
	.option:focus-visible {
		background: var(--ff-surface-hover);
		color: var(--ff-text);
		outline: none;
	}
	.option.selected {
		color: var(--ff-text);
	}
	.option :global(.tick) {
		flex: none;
		color: var(--ff-accent);
	}
	.opt-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
