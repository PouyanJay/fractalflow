/**
 * Compose-mode node graph definition. Compose is a node-graph lens over the
 * shared Scene: a fixed Source → Coloring → Output pipeline whose nodes read
 * and write the same scene store the other modes use. The graph topology is
 * fixed in this first version (arbitrary graphs + shader codegen are a later
 * rung); these pure builders keep the structure out of the view component.
 */
import { ART_STYLES, type ArtStyleId } from '$lib/stores/ui-logic';
import type { Node, Edge } from '@xyflow/svelte';

export type ComposeNodeType = 'source' | 'coloring' | 'output';

/** The three pipeline nodes, laid out left → right. */
export function composeNodes(): Node[] {
	return [
		{ id: 'source', type: 'source', position: { x: 0, y: 80 }, data: {} },
		{ id: 'coloring', type: 'coloring', position: { x: 340, y: 80 }, data: {} },
		{ id: 'output', type: 'output', position: { x: 680, y: 40 }, data: {} }
	];
}

/** Source → Coloring → Output. */
export function composeEdges(): Edge[] {
	return [
		{ id: 'source-coloring', source: 'source', target: 'coloring', animated: true },
		{ id: 'coloring-output', source: 'coloring', target: 'output', animated: true }
	];
}

/** Title for the Source node: the active art style's name. */
export function sourceLabel(styleId: ArtStyleId | null): string {
	return ART_STYLES.find((s) => s.id === styleId)?.label ?? 'Source';
}
