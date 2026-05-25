<script lang="ts">
	import { MODES, type ModeId } from '$lib/stores/ui-logic';
	import { getIcon } from '$lib/components/icons';

	interface Props {
		mode: ModeId;
	}

	let { mode }: Props = $props();

	const meta = $derived(MODES.find((m) => m.id === mode) ?? MODES[0]);
	const Icon = $derived(getIcon(meta.icon));
</script>

<section class="viewport" aria-label={`${meta.label} workspace`}>
	<div class="empty">
		<div class="empty-icon" aria-hidden="true">
			{#if Icon}<Icon size={26} />{/if}
		</div>
		<h1>{meta.label}</h1>
		<p class="blurb">{meta.blurb}</p>
		<p class="note">Shell ready — the renderer and tools for this mode arrive in the next phase.</p>
	</div>
</section>

<style>
	.viewport {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--ff-space-8);
		/* The future canvas area: a calm dark stage with a faint alignment grid. */
		background:
			radial-gradient(circle at 50% 40%, var(--ff-neutral-1), var(--ff-bg) 70%),
			linear-gradient(transparent 0 calc(100% - 1px), var(--ff-neutral-2) 0) 0 0 / 32px 32px,
			linear-gradient(90deg, transparent 0 calc(100% - 1px), var(--ff-neutral-2) 0) 0 0 / 32px 32px;
	}
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: var(--ff-space-2);
		max-width: 380px;
	}
	.empty-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 52px;
		height: 52px;
		margin-bottom: var(--ff-space-2);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-lg);
		background: var(--ff-surface);
		color: var(--ff-accent);
	}
	h1 {
		font-size: var(--ff-text-xl);
		font-weight: var(--ff-weight-semibold);
		color: var(--ff-text);
	}
	.blurb {
		font-size: var(--ff-text-md);
		color: var(--ff-text-secondary);
		line-height: var(--ff-leading-normal);
	}
	.note {
		margin-top: var(--ff-space-2);
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
	}
</style>
