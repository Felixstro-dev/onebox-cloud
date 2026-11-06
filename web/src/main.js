import { mount } from 'svelte';
import './vendor/felix-ui.js';
import './styles/app.css';
import './styles/doc.css';
import App from './App.svelte';

if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(() => {}));
}

const app = mount(App, { target: document.getElementById('app') });
export default app;
