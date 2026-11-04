import { writable } from 'svelte/store';

// Die Ansichten veröffentlichen hier nur den Zustand ihrer Auswahl. Die
// eigentliche Leiste lebt im gemeinsamen Bottom-Layer und kann deshalb nicht
// mit Job-Feld oder Navigation kollidieren.
export const selectionBar = writable(null);
