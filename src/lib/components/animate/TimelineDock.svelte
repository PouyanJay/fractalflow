<script lang="ts">
	/**
	 * Animate transport + timeline track. Owns the transient playhead and the
	 * playback loop; the keyframe list lives in the timeline store. Playing or
	 * scrubbing writes the interpolated scene to the shared scene store, so the
	 * viewport (and every other mode) animates.
	 */
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { Play, Pause, Plus, Undo2, Trash2 } from '@lucide/svelte';
	import { getTimelineStore } from '$lib/stores/timeline.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { interpolateScene } from '$lib/animate/timeline';

	const timeline = getTimelineStore();
	const scene = getSceneStore();

	let playhead = $state(0); // 0..1
	let playing = $state(false);
	let raf = 0;
	let lastTs = 0;

	const canPlay = $derived(timeline.keyframes.length >= 2);
	const seconds = $derived((timeline.durationMs / 1000).toFixed(1));
	const playheadSeconds = $derived(((playhead * timeline.durationMs) / 1000).toFixed(1));

	function applyAt(t: number) {
		// With fewer than two keyframes there's nothing to interpolate, so leave
		// the live scene alone — that lets you frame the next keyframe freely.
		if (timeline.keyframes.length >= 2) scene.setScene(interpolateScene(timeline.keyframes, t));
	}

	function tick(ts: number) {
		if (!playing) return;
		const dt = lastTs ? ts - lastTs : 0;
		lastTs = ts;
		let next = playhead + dt / timeline.durationMs;
		if (next >= 1) {
			next = 1;
			playing = false;
		}
		playhead = next;
		applyAt(playhead);
		if (playing) raf = requestAnimationFrame(tick);
	}

	function play() {
		if (!canPlay) return;
		if (playhead >= 1) playhead = 0;
		playing = true;
		lastTs = 0;
		raf = requestAnimationFrame(tick);
	}

	function pause() {
		playing = false;
		cancelAnimationFrame(raf);
	}

	function togglePlay() {
		if (playing) pause();
		else play();
	}

	function scrubTo(t: number) {
		pause();
		playhead = Math.max(0, Math.min(1, t));
		applyAt(playhead);
	}

	function onTrackPointer(event: PointerEvent) {
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		scrubTo((event.clientX - rect.left) / rect.width);
	}

	function addKeyframe() {
		timeline.add(playhead, scene.scene);
	}

	function removeLast() {
		const last = timeline.keyframes[timeline.keyframes.length - 1];
		if (last) timeline.remove(last.id);
	}

	onDestroy(() => {
		if (browser) cancelAnimationFrame(raf);
	});
</script>

<section class="dock" aria-label="Timeline">
	<div class="transport">
		<button
			type="button"
			class="btn primary"
			onclick={togglePlay}
			disabled={!canPlay}
			aria-label={playing ? 'Pause' : 'Play'}
		>
			{#if playing}<Pause size={16} />{:else}<Play size={16} />{/if}
			{playing ? 'Pause' : 'Play'}
		</button>
		<button type="button" class="btn" onclick={addKeyframe}>
			<Plus size={15} aria-hidden="true" /> Add keyframe
		</button>
		<button
			type="button"
			class="btn"
			onclick={removeLast}
			disabled={timeline.keyframes.length === 0}
			aria-label="Remove last keyframe"
		>
			<Undo2 size={15} aria-hidden="true" /> Remove last
		</button>
		<button
			type="button"
			class="btn"
			onclick={() => {
				pause();
				timeline.clear();
			}}
			disabled={timeline.keyframes.length === 0}
			aria-label="Clear keyframes"
		>
			<Trash2 size={15} aria-hidden="true" /> Clear
		</button>

		<div class="spacer"></div>

		<label class="duration">
			<span>Duration</span>
			<input
				type="number"
				min="1"
				max="60"
				step="1"
				value={seconds}
				oninput={(e) => timeline.setDuration(Number(e.currentTarget.value) * 1000)}
				aria-label="Duration in seconds"
			/>
			<span class="unit">s</span>
		</label>
		<span class="readout ff-num">{playheadSeconds}s / {seconds}s</span>
	</div>

	<div
		class="track"
		role="slider"
		tabindex="0"
		aria-label="Playhead"
		aria-valuemin={0}
		aria-valuemax={100}
		aria-valuenow={Math.round(playhead * 100)}
		onpointerdown={onTrackPointer}
		onkeydown={(e) => {
			if (e.key === 'ArrowRight') scrubTo(playhead + 0.02);
			else if (e.key === 'ArrowLeft') scrubTo(playhead - 0.02);
		}}
	>
		<div class="track-line"></div>
		{#each timeline.keyframes as kf (kf.id)}
			<span class="marker" style="left: {kf.t * 100}%" title="Keyframe at {Math.round(kf.t * 100)}%"
			></span>
		{/each}
		<div class="playhead" style="left: {playhead * 100}%"></div>
	</div>

	{#if timeline.keyframes.length < 2}
		<p class="hint">
			Frame a view in the viewport, then <strong>Add keyframe</strong>. Add at least two (move the
			playhead between them) to play an animation.
		</p>
	{/if}
</section>

<style>
	.dock {
		flex: none;
		display: flex;
		flex-direction: column;
		gap: var(--ff-space-3);
		padding: var(--ff-space-3) var(--ff-space-4);
		border-top: 1px solid var(--ff-border);
		background: var(--ff-surface);
	}
	.transport {
		display: flex;
		align-items: center;
		gap: var(--ff-space-2);
	}
	.btn {
		display: inline-flex;
		align-items: center;
		gap: var(--ff-space-1);
		height: 30px;
		padding: 0 var(--ff-space-3);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-md);
		background: var(--ff-surface-raised);
		color: var(--ff-text-secondary);
		font-size: var(--ff-text-sm);
		cursor: pointer;
		transition: border-color var(--ff-dur-fast) var(--ff-ease);
	}
	.btn:hover:not(:disabled) {
		border-color: var(--ff-border-strong);
		color: var(--ff-text);
	}
	.btn.primary {
		background: var(--ff-accent);
		border-color: var(--ff-accent);
		color: var(--ff-accent-contrast);
		font-weight: var(--ff-weight-semibold);
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.spacer {
		flex: 1;
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
		height: 30px;
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
	.readout {
		min-width: 96px;
		text-align: right;
		font-size: var(--ff-text-sm);
		color: var(--ff-text-secondary);
	}
	.track {
		position: relative;
		height: 36px;
		border-radius: var(--ff-radius-md);
		background: var(--ff-surface-raised);
		border: 1px solid var(--ff-border);
		cursor: pointer;
		touch-action: none;
	}
	.track:focus-visible {
		outline: 2px solid var(--ff-accent);
		outline-offset: 2px;
	}
	.track-line {
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		height: 2px;
		background: var(--ff-border-strong);
	}
	.marker {
		position: absolute;
		top: 50%;
		width: 11px;
		height: 11px;
		background: var(--ff-accent);
		border: 1px solid var(--ff-accent-contrast);
		border-radius: 2px;
		transform: translate(-50%, -50%) rotate(45deg);
	}
	.playhead {
		position: absolute;
		top: 4px;
		bottom: 4px;
		width: 2px;
		background: var(--ff-text);
		transform: translateX(-50%);
		pointer-events: none;
	}
	.hint {
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
		line-height: var(--ff-leading-normal);
	}
	.hint strong {
		color: var(--ff-text-secondary);
		font-weight: var(--ff-weight-medium);
	}
</style>
