<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { MODES } from '$lib/stores/ui-logic';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { getIcon } from '$lib/components/icons';
	import { Search } from '@lucide/svelte';

	const ui = getUiStore();

	interface PaletteCommand {
		id: string;
		label: string;
		hint: string;
		icon: string;
		run: () => void;
	}

	const commands: PaletteCommand[] = [
		...MODES.map((m) => ({
			id: `go-${m.id}`,
			label: `Go to ${m.label}`,
			hint: 'Mode',
			icon: m.icon,
			run: () => goto(resolve(m.path))
		})),
		{
			id: 'toggle-library',
			label: 'Toggle Library panel',
			hint: 'Layout',
			icon: 'panel-left',
			run: () => ui.togglePanel('library')
		},
		{
			id: 'toggle-inspector',
			label: 'Toggle Inspector panel',
			hint: 'Layout',
			icon: 'panel-right',
			run: () => ui.togglePanel('inspector')
		}
	];

	let query = $state('');
	let selected = $state(0);
	let input = $state<HTMLInputElement | null>(null);

	const filtered = $derived(
		commands.filter((c) => c.label.toLowerCase().includes(query.trim().toLowerCase()))
	);

	$effect(() => {
		if (selected >= filtered.length) selected = 0;
	});

	$effect(() => {
		if (ui.commandPaletteOpen) {
			query = '';
			selected = 0;
			tick().then(() => input?.focus());
		}
	});

	function run(cmd?: PaletteCommand) {
		const c = cmd ?? filtered[selected];
		if (!c) return;
		ui.closeCommandPalette();
		c.run();
	}

	function onkeydown(event: KeyboardEvent) {
		if (!ui.commandPaletteOpen) return;
		const count = Math.max(filtered.length, 1);
		if (event.key === 'Escape') {
			event.preventDefault();
			ui.closeCommandPalette();
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			selected = (selected + 1) % count;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			selected = (selected - 1 + count) % count;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			run();
		}
	}
</script>

<svelte:window {onkeydown} />

{#if ui.commandPaletteOpen}
	<div class="layer">
		<button
			type="button"
			class="backdrop"
			aria-label="Close command palette"
			onclick={() => ui.closeCommandPalette()}
		></button>
		<div class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
			<div class="search-row">
				<Search size={16} aria-hidden="true" />
				<input
					bind:this={input}
					bind:value={query}
					type="text"
					placeholder="Search commands…"
					aria-label="Search commands"
					autocomplete="off"
					spellcheck="false"
				/>
			</div>
			<ul class="results" role="listbox" aria-label="Commands">
				{#each filtered as c, i (c.id)}
					{@const Icon = getIcon(c.icon)}
					<li>
						<button
							type="button"
							class="result"
							class:active={i === selected}
							role="option"
							aria-selected={i === selected}
							onclick={() => run(c)}
							onmouseenter={() => (selected = i)}
						>
							<span class="r-icon" aria-hidden="true"
								>{#if Icon}<Icon size={16} />{/if}</span
							>
							<span class="r-label">{c.label}</span>
							<span class="r-hint">{c.hint}</span>
						</button>
					</li>
				{:else}
					<li class="no-results">No matching commands</li>
				{/each}
			</ul>
		</div>
	</div>
{/if}

<style>
	.layer {
		position: fixed;
		inset: 0;
		z-index: var(--ff-z-overlay);
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding-top: 12vh;
	}
	.backdrop {
		position: absolute;
		inset: 0;
		border: none;
		padding: 0;
		background: rgba(4, 6, 10, 0.6);
		cursor: default;
	}
	.palette {
		position: relative;
		width: min(560px, calc(100vw - var(--ff-space-8)));
		background: var(--ff-surface-overlay);
		border: 1px solid var(--ff-border-strong);
		border-radius: var(--ff-radius-lg);
		box-shadow: var(--ff-shadow-overlay);
		overflow: hidden;
	}
	.search-row {
		display: flex;
		align-items: center;
		gap: var(--ff-space-3);
		padding: 0 var(--ff-space-4);
		height: 48px;
		border-bottom: 1px solid var(--ff-border);
		color: var(--ff-text-muted);
	}
	.search-row input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		color: var(--ff-text);
		font-size: var(--ff-text-lg);
	}
	.search-row input::placeholder {
		color: var(--ff-text-muted);
	}
	.results {
		list-style: none;
		margin: 0;
		padding: var(--ff-space-2);
		max-height: 320px;
		overflow-y: auto;
	}
	.result {
		display: flex;
		align-items: center;
		gap: var(--ff-space-3);
		width: 100%;
		padding: var(--ff-space-2) var(--ff-space-3);
		border: none;
		border-radius: var(--ff-radius-md);
		background: transparent;
		text-align: left;
		cursor: pointer;
	}
	.result.active {
		background: var(--ff-surface-active);
	}
	.r-icon {
		display: inline-flex;
		color: var(--ff-text-muted);
	}
	.result.active .r-icon {
		color: var(--ff-accent);
	}
	.r-label {
		flex: 1;
		font-size: var(--ff-text-md);
		color: var(--ff-text);
	}
	.r-hint {
		font-size: var(--ff-text-xs);
		color: var(--ff-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.no-results {
		padding: var(--ff-space-4);
		text-align: center;
		color: var(--ff-text-muted);
		font-size: var(--ff-text-sm);
	}
</style>
