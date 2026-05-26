/**
 * Maps the string icon names used in pure metadata (ui-logic) to Lucide
 * components. Keeps the logic layer framework-free while the UI resolves icons.
 */
import {
	Compass,
	Workflow,
	Boxes,
	Flame,
	Orbit,
	Spline,
	Command,
	Search,
	PanelLeft,
	PanelRight,
	Palette,
	SwatchBook,
	Bookmark,
	Shapes,
	Rows3,
	ChevronRight,
	Share2,
	X
} from '@lucide/svelte';

export const icons = {
	compass: Compass,
	workflow: Workflow,
	boxes: Boxes,
	flame: Flame,
	orbit: Orbit,
	spline: Spline,
	command: Command,
	search: Search,
	'panel-left': PanelLeft,
	'panel-right': PanelRight,
	palette: Palette,
	'swatch-book': SwatchBook,
	bookmark: Bookmark,
	shapes: Shapes,
	'rows-3': Rows3,
	'chevron-right': ChevronRight,
	'share-2': Share2,
	x: X
} as const;

export type IconName = keyof typeof icons;

export function getIcon(name: string) {
	return icons[name as IconName];
}
