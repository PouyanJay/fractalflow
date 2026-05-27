<script lang="ts">
	/**
	 * Explore's right slide-over: two faces over the live scene.
	 *  - Codex: what you're looking at (description), where you are (center/zoom/
	 *    iterations) and the named Mandelbrot landmark you're near.
	 *  - Journey: the two curated journeys (Formation/Zoom) with transport, plus
	 *    waypoint authoring for a multi-stop Zoom dive. Playback streams frames
	 *    through the shared scene store, then restores the user's view.
	 * Parameter editing lives in Compose now, so on that route this panel defers.
	 */
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { Play, Pause, MapPin, Trash2, RotateCcw, Bookmark } from '@lucide/svelte';
	import { modeFromPath, type ArtStyleId } from '$lib/stores/ui-logic';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { getJourneyStore } from '$lib/stores/journey.svelte';
	import { getBookmarksStore } from '$lib/stores/bookmarks.svelte';
	import { getRenderer } from '$lib/fractals/registry';
	import { effectiveMaxIter } from '$lib/fractals/deep-zoom-2d/renderer';
	import { formatZoom } from '$lib/engine/camera';
	import { encodeScene, decodeScene } from '$lib/scene/codec';
	import { describeScene, nearestLandmark } from '$lib/codex/codex';
	import { JOURNEYS, journeyKeyframes, type JourneyType } from '$lib/animate/journey';
	import { interpolateScene, cloneScene } from '$lib/animate/timeline';
	import SidePanel from './SidePanel.svelte';

	const ui = getUiStore();
	const scene = getSceneStore();
	const journey = getJourneyStore();
	const bookmarks = getBookmarksStore();

	// Saved views — discovered while exploring, pinned here in the Codex.
	function saveView() {
		bookmarks.add(
			`${desc.title} · ${zoom}`,
			encodeScene(scene.scene),
			ui.selectedStyle ?? 'deep-zoom-2d'
		);
	}
	function loadView(styleId: string, token: string) {
		ui.selectArtStyle(styleId as ArtStyleId);
		scene.setScene(decodeScene(token));
	}

	const isCompose = $derived(modeFromPath(page.url.pathname) === 'compose');
	const hasRenderer = $derived(getRenderer(ui.selectedStyle) !== null);
	const desc = $derived(describeScene(ui.selectedStyle, scene.scene));
	const landmark = $derived(nearestLandmark(ui.selectedStyle, scene.scene));
	const isDeepZoom = $derived(ui.selectedStyle === 'deep-zoom-2d');
	// Deep zoom auto-lifts the iteration count with depth; show what's actually used.
	const detailValue = $derived(isDeepZoom ? effectiveMaxIter(scene.scene) : scene.maxIter);
	const detailLabel = $derived(
		isDeepZoom ? 'Iterations' : ui.selectedStyle === 'geometric-3d' ? 'Detail' : 'Exposure'
	);
	const zoom = $derived(formatZoom(scene.camera.scale));
	const center = $derived(
		`${scene.camera.centerX.toFixed(5)}, ${scene.camera.centerY.toFixed(5)}i`
	);

	let tab = $state<'codex' | 'journey'>('codex');
	const selectedJourney = $derived(JOURNEYS.find((j) => j.id === journey.type) ?? JOURNEYS[0]);
	const isZoom = $derived(journey.type === 'zoom');
	const journeySeconds = $derived((journey.durationMs / 1000).toFixed(0));

	// --- Journey playback (streams frames into the shared scene, then restores) ---
	let progress = $state(0);
	let raf = 0;
	let lastTs = 0;
	let frames: ReturnType<typeof journeyKeyframes> = [];
	let original = cloneScene(scene.scene);

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
		const next = progress + dt / journey.durationMs;
		if (next >= 1) {
			progress = 1;
			scene.setScene(cloneScene(original)); // land exactly on the user's view
			stop(false);
			return;
		}
		progress = next;
		scene.setScene(interpolateScene(frames, progress));
		raf = requestAnimationFrame(tick);
	}

	function play() {
		original = cloneScene(scene.scene);
		frames = journeyKeyframes(journey.type, original, journey.waypoints);
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

	// Leaving Explore (e.g. to Compose) ends any preview and restores the view.
	$effect(() => {
		if (isCompose && journey.playing) stop(true);
	});

	onDestroy(() => {
		if (browser && raf) cancelAnimationFrame(raf);
	});
</script>

{#snippet tabs()}
	<div class="tabs" role="tablist" aria-label="Inspector views">
		<button
			type="button"
			role="tab"
			class="tab"
			class:active={tab === 'codex'}
			aria-selected={tab === 'codex'}
			onclick={() => (tab = 'codex')}>Codex</button
		>
		<button
			type="button"
			role="tab"
			class="tab"
			class:active={tab === 'journey'}
			aria-selected={tab === 'journey'}
			onclick={() => (tab = 'journey')}>Journey</button
		>
	</div>
{/snippet}

<SidePanel title="Codex" panelId="inspector" side="right" header={isCompose ? undefined : tabs}>
	{#if isCompose}
		{#if !hasRenderer}
			<p class="defer">Pick an art style in the Start palette to read about it here.</p>
		{:else}
			<section class="group">
				<h3 class="codex-title">{desc.title}</h3>
				<p class="codex-body">{desc.body}</p>
			</section>
			{#if desc.math}
				<section class="group">
					<h4 class="group-label">Mathematics</h4>
					<p class="codex-body">{desc.math}</p>
				</section>
			{/if}
			{#if desc.applications}
				<section class="group">
					<h4 class="group-label">Applications</h4>
					<p class="codex-body">{desc.applications}</p>
				</section>
			{/if}
			{#if desc.tips}
				<section class="group">
					<h4 class="group-label">How to create</h4>
					<p class="codex-body">{desc.tips}</p>
				</section>
			{/if}
			<p class="defer compose-note">
				Parameters are edited in the node graph; switch to <strong>Explore</strong> to inhabit the fractal
				and set up journeys.
			</p>
		{/if}
	{:else if !hasRenderer}
		<p class="defer">Pick an art style in Compose's Start palette to begin exploring.</p>
	{:else if tab === 'codex'}
		<section class="group">
			<h3 class="codex-title">{desc.title}</h3>
			<p class="codex-body">{desc.body}</p>
		</section>

		{#if landmark}
			<section class="group landmark">
				<MapPin size={14} aria-hidden="true" />
				<span>Near <strong>{landmark.label}</strong></span>
			</section>
		{/if}

		<section class="group">
			<h4 class="group-label">Position</h4>
			<dl class="readouts">
				{#if isDeepZoom}
					<div>
						<dt>Center</dt>
						<dd class="ff-num">{center}</dd>
					</div>
				{/if}
				<div>
					<dt>Zoom</dt>
					<dd class="ff-num">{zoom}</dd>
				</div>
				<div>
					<dt>{detailLabel}</dt>
					<dd class="ff-num">{detailValue}</dd>
				</div>
			</dl>
		</section>

		<section class="group">
			<div class="wp-head">
				<h4 class="group-label">Saved views</h4>
				<button type="button" class="link" onclick={saveView}>
					<Bookmark size={12} aria-hidden="true" /> Save
				</button>
			</div>
			{#if bookmarks.list.length === 0}
				<p class="hint">Save a view to pin it here and return any time.</p>
			{:else}
				<ul class="saved">
					{#each bookmarks.list as bm (bm.id)}
						<li>
							<button type="button" class="entry" onclick={() => loadView(bm.styleId, bm.token)}>
								{bm.label}
							</button>
							<button
								type="button"
								class="wp-del"
								aria-label={`Delete bookmark ${bm.label}`}
								onclick={() => bookmarks.remove(bm.id)}
							>
								<Trash2 size={13} aria-hidden="true" />
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<button type="button" class="reset" onclick={() => scene.reset()}>
			<RotateCcw size={14} aria-hidden="true" /> Reset view
		</button>
	{:else}
		<section class="group">
			<div class="seg-group" role="group" aria-label="Journey type">
				{#each JOURNEYS as j (j.id)}
					<button
						type="button"
						class="seg"
						class:active={journey.type === j.id}
						aria-pressed={journey.type === j.id}
						onclick={() => selectType(j.id)}>{j.label}</button
					>
				{/each}
			</div>
			<p class="codex-body">{selectedJourney.blurb}</p>
		</section>

		<section class="group">
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
					value={journeySeconds}
					oninput={(e) => journey.setDuration(Number(e.currentTarget.value) * 1000)}
					aria-label="Journey duration in seconds"
				/>
				<span class="unit">s</span>
			</label>
		</section>

		{#if isZoom}
			<section class="group">
				<div class="wp-head">
					<h4 class="group-label">Waypoints</h4>
					{#if journey.waypoints.length > 0}
						<button
							type="button"
							class="link"
							onclick={() => journey.clearWaypoints()}
							aria-label="Clear waypoints">Clear</button
						>
					{/if}
				</div>
				{#if journey.waypoints.length === 0}
					<p class="hint">
						Travel to a spot, then add it. With two or more, the dive flies through them in order;
						otherwise it zooms into the current view.
					</p>
				{:else}
					<ol class="wp-list">
						{#each journey.waypoints as wp, i (i)}
							<li>
								<span class="wp-idx ff-num">{i + 1}</span>
								<span class="wp-zoom ff-num">{formatZoom(wp.scale)}</span>
								<button
									type="button"
									class="wp-del"
									aria-label={`Remove waypoint ${i + 1}`}
									onclick={() => journey.removeWaypoint(i)}
								>
									<Trash2 size={13} aria-hidden="true" />
								</button>
							</li>
						{/each}
					</ol>
				{/if}
				<button type="button" class="add-wp" onclick={() => journey.addWaypoint(scene.camera)}>
					<MapPin size={14} aria-hidden="true" /> Add this view
				</button>
			</section>
		{/if}
	{/if}
</SidePanel>

<style>
	.tabs {
		display: flex;
		width: 100%;
		height: 100%;
	}
	.tab {
		flex: 1;
		border: none;
		background: transparent;
		color: var(--ff-text-muted);
		font-size: var(--ff-text-xs);
		font-weight: var(--ff-weight-semibold);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		transition:
			color var(--ff-dur-fast) var(--ff-ease),
			border-color var(--ff-dur-fast) var(--ff-ease);
	}
	.tab:hover {
		color: var(--ff-text);
	}
	.tab.active {
		color: var(--ff-text);
		border-bottom-color: var(--ff-accent);
	}

	.group + .group {
		margin-top: var(--ff-space-5);
	}
	.group-label {
		font-size: var(--ff-text-xs);
		font-weight: var(--ff-weight-semibold);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ff-text-muted);
		margin-bottom: var(--ff-space-2);
	}
	.codex-title {
		font-size: var(--ff-text-lg);
		font-weight: var(--ff-weight-semibold);
		color: var(--ff-text);
	}
	.codex-body {
		font-size: var(--ff-text-sm);
		color: var(--ff-text-secondary);
		line-height: var(--ff-leading-normal);
		margin-top: var(--ff-space-2);
	}
	.defer {
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
		line-height: var(--ff-leading-normal);
		padding: var(--ff-space-2) var(--ff-space-3);
		border: 1px dashed var(--ff-border);
		border-radius: var(--ff-radius-md);
	}
	.defer strong {
		color: var(--ff-text-secondary);
		font-weight: var(--ff-weight-medium);
	}
	.compose-note {
		margin-top: var(--ff-space-5);
	}
	.landmark {
		display: flex;
		align-items: center;
		gap: var(--ff-space-2);
		padding: var(--ff-space-2) var(--ff-space-3);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-md);
		background: var(--ff-surface-raised);
		color: var(--ff-text-secondary);
		font-size: var(--ff-text-sm);
	}
	.landmark :global(svg) {
		color: var(--ff-accent);
		flex: none;
	}
	.landmark strong {
		color: var(--ff-text);
		font-weight: var(--ff-weight-medium);
	}
	.readouts {
		display: flex;
		flex-direction: column;
		gap: var(--ff-space-2);
		margin: 0;
	}
	.readouts div {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--ff-space-3);
	}
	.readouts dt {
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
	}
	.readouts dd {
		margin: 0;
		font-size: var(--ff-text-sm);
		color: var(--ff-text-secondary);
	}
	.reset {
		display: inline-flex;
		align-items: center;
		gap: var(--ff-space-2);
		width: 100%;
		justify-content: center;
		height: 32px;
		margin-top: var(--ff-space-5);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-md);
		background: var(--ff-surface-raised);
		color: var(--ff-text-secondary);
		font-size: var(--ff-text-sm);
		cursor: pointer;
		transition: border-color var(--ff-dur-fast) var(--ff-ease);
	}
	.reset:hover {
		border-color: var(--ff-border-strong);
		color: var(--ff-text);
	}

	.seg-group {
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
		margin-top: var(--ff-space-3);
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
	.wp-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		border: none;
		background: transparent;
		color: var(--ff-text-muted);
		font-size: var(--ff-text-xs);
		cursor: pointer;
	}
	.link:hover {
		color: var(--ff-text);
	}
	.saved {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.saved li {
		display: flex;
		align-items: center;
		gap: var(--ff-space-1);
	}
	.entry {
		flex: 1;
		min-width: 0;
		padding: 6px var(--ff-space-2);
		border: none;
		border-radius: var(--ff-radius-md);
		background: transparent;
		text-align: left;
		color: var(--ff-text-secondary);
		font-size: var(--ff-text-sm);
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		transition: background var(--ff-dur-fast) var(--ff-ease);
	}
	.entry:hover {
		background: var(--ff-surface-hover);
		color: var(--ff-text);
	}
	.hint {
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
		line-height: var(--ff-leading-normal);
	}
	.wp-list {
		list-style: none;
		margin: 0 0 var(--ff-space-2);
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--ff-space-1);
	}
	.wp-list li {
		display: flex;
		align-items: center;
		gap: var(--ff-space-2);
		padding: var(--ff-space-1) var(--ff-space-2);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-sm);
		background: var(--ff-surface-raised);
	}
	.wp-idx {
		width: 18px;
		color: var(--ff-text-muted);
		font-size: var(--ff-text-xs);
	}
	.wp-zoom {
		flex: 1;
		color: var(--ff-text-secondary);
		font-size: var(--ff-text-sm);
	}
	.wp-del {
		display: inline-flex;
		border: none;
		background: transparent;
		color: var(--ff-text-muted);
		cursor: pointer;
	}
	.wp-del:hover {
		color: var(--ff-danger);
	}
	.add-wp {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--ff-space-2);
		width: 100%;
		height: 30px;
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-md);
		background: var(--ff-surface-raised);
		color: var(--ff-text-secondary);
		font-size: var(--ff-text-sm);
		cursor: pointer;
		transition: border-color var(--ff-dur-fast) var(--ff-ease);
	}
	.add-wp:hover {
		border-color: var(--ff-border-strong);
		color: var(--ff-text);
	}
</style>
