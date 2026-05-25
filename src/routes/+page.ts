import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';

// The root has no view of its own — Explore is the default lens.
export function load() {
	redirect(307, `${base}/explore`);
}
