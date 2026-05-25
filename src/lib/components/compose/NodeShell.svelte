<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		/** Show a left (input) handle. */
		target?: boolean;
		/** Show a right (output) handle. */
		source?: boolean;
		children: Snippet;
	}

	let { title, target = false, source = false, children }: Props = $props();
</script>

{#if target}
	<Handle type="target" position={Position.Left} />
{/if}

<div class="node">
	<header class="node-head">{title}</header>
	<div class="node-body">
		{@render children()}
	</div>
</div>

{#if source}
	<Handle type="source" position={Position.Right} />
{/if}

<style>
	.node {
		width: 100%;
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-lg);
		background: var(--ff-surface);
		overflow: hidden;
	}
	.node-head {
		padding: var(--ff-space-2) var(--ff-space-3);
		font-size: var(--ff-text-xs);
		font-weight: var(--ff-weight-semibold);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ff-text-secondary);
		background: var(--ff-surface-raised);
		border-bottom: 1px solid var(--ff-border);
	}
	.node-body {
		display: flex;
		flex-direction: column;
		gap: var(--ff-space-3);
		padding: var(--ff-space-3);
	}
</style>
