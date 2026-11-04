import { writable } from 'svelte/store';

/**
 * Zwischenablage für den Dateibereich. Sie lebt bewusst außerhalb der
 * Komponente, damit sie einen Ordnerwechsel übersteht.
 */
export const clipboard = writable({ mode: null, ids: [], names: [] });
