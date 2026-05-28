/// <reference types="@webgpu/types" />
// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	/** App version, injected from package.json by Vite's `define` (see vite.config.ts). */
	const __APP_VERSION__: string;
}

export {};
