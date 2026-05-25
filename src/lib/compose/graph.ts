/**
 * Compose-mode node graph definition. Compose is a node-graph lens over the
 * shared Scene: a fixed Source → Coloring → Output pipeline whose nodes read
 * and write the same scene store the other modes use. The graph topology is
 * fixed in this first version (arbitrary graphs + shader codegen are a later
 * rung); these pure builders keep the structure out of the view component.
 */
import { ART_STYLES, type ArtStyleId } from '$lib/stores/ui-logic';
import type { Node, Edge } from '@xyflow/svelte';

export type ComposeNodeType = 'source' | 'warp' | 'coloring' | 'post' | 'output';

/** The pipeline nodes, laid out left → right. */
export function composeNodes(): Node[] {
	return [
		{ id: 'source', type: 'source', position: { x: 0, y: 120 }, data: {} },
		{ id: 'warp', type: 'warp', position: { x: 280, y: 120 }, data: {} },
		{ id: 'coloring', type: 'coloring', position: { x: 560, y: 120 }, data: {} },
		{ id: 'post', type: 'post', position: { x: 840, y: 120 }, data: {} },
		{ id: 'output', type: 'output', position: { x: 1120, y: 80 }, data: {} }
	];
}

/** Source → Warp → Coloring → Post → Output. */
export function composeEdges(): Edge[] {
	const link = (source: string, target: string): Edge => ({
		id: `${source}-${target}`,
		source,
		target,
		animated: true
	});
	return [
		link('source', 'warp'),
		link('warp', 'coloring'),
		link('coloring', 'post'),
		link('post', 'output')
	];
}

/** Title for the Source node: the active art style's name. */
export function sourceLabel(styleId: ArtStyleId | null): string {
	return ART_STYLES.find((s) => s.id === styleId)?.label ?? 'Source';
}
