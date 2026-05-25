<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		side?: 'left' | 'right';
		children: Snippet;
	}

	let { title, side = 'left', children }: Props = $props();
</script>

<aside class="panel" class:right={side === 'right'} aria-label={title}>
	<div class="head">
		<h2>{title}</h2>
	</div>
	<div class="body">
		{@render children()}
	</div>
</aside>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		width: var(--ff-panel-w);
		background: var(--ff-surface);
		border-right: 1px solid var(--ff-border);
		overflow: hidden;
	}
	.panel.right {
		border-right: none;
		border-left: 1px solid var(--ff-border);
	}
	.head {
		display: flex;
		align-items: center;
		height: 36px;
		padding: 0 var(--ff-space-4);
		border-bottom: 1px solid var(--ff-border);
		flex: none;
	}
	.head h2 {
		font-size: var(--ff-text-xs);
		font-weight: var(--ff-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ff-text-muted);
	}
	.body {
		flex: 1;
		overflow-y: auto;
		padding: var(--ff-space-3);
	}
</style>
