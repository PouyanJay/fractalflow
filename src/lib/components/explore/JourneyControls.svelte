<script lang="ts">
	/**
	 * Explore's Journeys panel: an overlay (not a flex sibling — so it never feeds
	 * the canvas drawing-buffer height back into layout) that plays the two
	 * curated journeys. Play streams the interpolated journey frames into the
	 * shared scene store so the live viewport animates, then restores the user's
	 * view — playback is a non-destructive preview. Movie export of the same
	 * journey lives in the Export sheet.
	 */
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { Play, Pause, Clapperboard, ChevronDown } from '@lucide/svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { getJourneyStore } from '$lib/stores/journey.svelte';
	import { JOURNEYS, journeyKeyframes, type JourneyType } from '$lib/animate/journey';
	import { interpolateScene, cloneScene } from '$lib/animate/timeline';

	const scene = getSceneStore();
	const journey = getJourneyStore();

	let open = $state(false);
	let progress = $state(0); // 0..1
	let raf = 0;
	let lastTs = 0;
	let frames: ReturnType<typeof journeyKeyframes> = [];
	let original = $state.raw(scene.scene);

	const selected = $derived(JOURNEYS.find((j) => j.id === journey.type) ?? JOURNEYS[0]);
	const seconds = $derived((journey.durationMs / 1000).toFixed(0));

	function stop(restore: boolean) {
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
		lastTs = 0;
		journey.setPlaying(false);
		if (restore) scene.setScene(cloneScene(original));
	}

	function tick(ts: number) {
		if (!journey.playing) return;
		const dt = lastTs ? ts - lastTs : 0;
		lastTs = ts;
		let next = progress + dt / journey.durationMs;
		if (next >= 1) {
			// Land exactly on the destination (the user's view) and stop.
			progress = 1;
			scene.setScene(cloneScene(original));
			stop(false);
			return;
		}
		progress = next;
		scene.setScene(interpolateScene(frames, progress));
		raf = requestAnimationFrame(tick);
	}

	function play() {
		original = cloneScene(scene.scene);
		frames = journeyKeyframes(journey.type, original);
		progress = 0;
		journey.setPlaying(true);
		lastTs = 0;
		raf = requestAnimationFrame(tick);
	}

	function togglePlay() {
		if (journey.playing) stop(true);
		else play();
	}

	function selectType(type: JourneyType) {
		if (journey.playing) stop(true);
		journey.setType(type);
	}

	function setDurationSeconds(value: string) {
		journey.setDuration(Number(value) * 1000);
	}

	onDestroy(() => {
		if (browser && raf) cancelAnimationFrame(raf);
	});
</script>

{#if open}
	<section class="panel" aria-label="Journeys">
		<header class="head">
			<h2>Journeys</h2>
			<button
				type="button"
				class="icon"
				aria-label="Collapse Journeys panel"
				onclick={() => {
					stop(true);
					open = false;
				}}
			>
				<ChevronDown size={16} aria-hidden="true" />
			</button>
		</header>

		<div class="types" role="group" aria-label="Journey type">
			{#each JOURNEYS as j (j.id)}
				<button
					type="button"
					class="seg"
					class:active={journey.type === j.id}
					aria-pressed={journey.type === j.id}
					onclick={() => selectType(j.id)}
				>
					{j.label}
				</button>
			{/each}
		</div>

		<p class="blurb">{selected.blurb}</p>

		<div class="transport">
			<button
				type="button"
				class="play"
				onclick={togglePlay}
				aria-label={journey.playing ? 'Pause journey' : 'Play journey'}
			>
				{#if journey.playing}<Pause size={16} aria-hidden="true" />{:else}<Play
						size={16}
						aria-hidden="true"
					/>{/if}
				{journey.playing ? 'Pause' : 'Play'}
			</button>
			<div
				class="bar"
				role="progressbar"
				aria-label="Journey progress"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(progress * 100)}
			>
				<div class="fill" style="width: {progress * 100}%"></div>
			</div>
		</div>

		<label class="duration">
			<span>Duration</span>
			<input
				type="number"
				min="2"
				max="60"
				step="1"
				value={seconds}
				oninput={(e) => setDurationSeconds(e.currentTarget.value)}
				aria-label="Journey duration in seconds"
			/>
			<span class="unit">s</span>
		</label>
	</section>
{:else}
	<button type="button" class="fab" onclick={() => (open = true)} aria-label="Open Journeys panel">
		<Clapperboard size={16} aria-hidden="true" />
		<span>Journeys</span>
	</button>
{/if}

<style>
	.fab {
		position: absolute;
		left: var(--ff-space-4);
		bottom: var(--ff-space-4);
		z-index: var(--ff-z-overlay);
		display: inline-flex;
		align-items: center;
		gap: var(--ff-space-2);
		height: 34px;
		padding: 0 var(--ff-space-3);
		border: 1px solid var(--ff-border-strong);
		border-radius: var(--ff-radius-md);
		background: var(--ff-surface-overlay);
		color: var(--ff-text-secondary);
		font-size: var(--ff-text-sm);
		font-weight: var(--ff-weight-medium);
		cursor: pointer;
		box-shadow: var(--ff-shadow-overlay);
		transition:
			color var(--ff-dur-fast) var(--ff-ease),
			border-color var(--ff-dur-fast) var(--ff-ease);
	}
	.fab:hover {
		color: var(--ff-text);
		border-color: var(--ff-accent);
	}
	.panel {
		position: absolute;
		left: var(--ff-space-4);
		bottom: var(--ff-space-4);
		z-index: var(--ff-z-overlay);
		display: flex;
		flex-direction: column;
		gap: var(--ff-space-3);
		width: 280px;
		max-width: calc(100% - var(--ff-space-8));
		padding: var(--ff-space-4);
		background: var(--ff-surface-overlay);
		border: 1px solid var(--ff-border-strong);
		border-radius: var(--ff-radius-lg);
		box-shadow: var(--ff-shadow-overlay);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.head h2 {
		font-size: var(--ff-text-md);
		font-weight: var(--ff-weight-semibold);
		color: var(--ff-text);
	}
	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border: none;
		border-radius: var(--ff-radius-md);
		background: transparent;
		color: var(--ff-text-muted);
		cursor: pointer;
		transition: background var(--ff-dur-fast) var(--ff-ease);
	}
	.icon:hover {
		background: var(--ff-surface-hover);
		color: var(--ff-text);
	}
	.types {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--ff-space-1);
		padding: 3px;
		background: var(--ff-surface-raised);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-md);
	}
	.seg {
		height: 28px;
		border: none;
		border-radius: var(--ff-radius-sm);
		background: transparent;
		color: var(--ff-text-muted);
		font-size: var(--ff-text-sm);
		font-weight: var(--ff-weight-medium);
		cursor: pointer;
		transition:
			background var(--ff-dur-fast) var(--ff-ease),
			color var(--ff-dur-fast) var(--ff-ease);
	}
	.seg:hover {
		color: var(--ff-text);
	}
	.seg.active {
		background: var(--ff-surface-active);
		color: var(--ff-text);
	}
	.blurb {
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
		line-height: var(--ff-leading-tight);
	}
	.transport {
		display: flex;
		align-items: center;
		gap: var(--ff-space-3);
	}
	.play {
		display: inline-flex;
		align-items: center;
		gap: var(--ff-space-2);
		height: 32px;
		padding: 0 var(--ff-space-3);
		border: none;
		border-radius: var(--ff-radius-md);
		background: var(--ff-accent);
		color: var(--ff-accent-contrast);
		font-size: var(--ff-text-sm);
		font-weight: var(--ff-weight-semibold);
		cursor: pointer;
		transition: background var(--ff-dur-fast) var(--ff-ease);
	}
	.play:hover {
		background: var(--ff-primary-strong);
	}
	.bar {
		flex: 1;
		height: 6px;
		border-radius: var(--ff-radius-full);
		background: var(--ff-surface-raised);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: var(--ff-accent);
	}
	.duration {
		display: inline-flex;
		align-items: center;
		gap: var(--ff-space-2);
		font-size: var(--ff-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ff-text-muted);
	}
	.duration input {
		width: 54px;
		height: 28px;
		padding: 0 var(--ff-space-2);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-md);
		background: var(--ff-surface-raised);
		color: var(--ff-text);
		font: inherit;
		font-variant-numeric: tabular-nums;
		text-transform: none;
	}
	.duration .unit {
		margin-left: -4px;
	}
</style>
