<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Required: every icon-only button must be labelled for assistive tech. */
		label: string;
		onclick?: () => void;
		active?: boolean;
		title?: string;
		children: Snippet;
	}

	let { label, onclick, active = false, title, children }: Props = $props();
</script>

<button
	type="button"
	class="icon-btn"
	class:active
	aria-label={label}
	aria-pressed={active}
	title={title ?? label}
	{onclick}
>
	{@render children()}
</button>

<style>
	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		padding: 0;
		border: 1px solid transparent;
		border-radius: var(--ff-radius-md);
		background: transparent;
		color: var(--ff-text-muted);
		cursor: pointer;
		transition:
			background var(--ff-dur-fast) var(--ff-ease),
			color var(--ff-dur-fast) var(--ff-ease);
	}
	.icon-btn:hover {
		background: var(--ff-surface-hover);
		color: var(--ff-text);
	}
	.icon-btn.active {
		color: var(--ff-accent);
		background: var(--ff-surface-active);
	}
</style>
