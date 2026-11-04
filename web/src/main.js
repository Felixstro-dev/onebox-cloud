import { mount } from 'svelte';
import './vendor/felix-ui.js';
import './styles/app.css';
import './styles/doc.css';
import App from './App.svelte';

const app = mount(App, { target: document.getElementById('app') });
export default app;
