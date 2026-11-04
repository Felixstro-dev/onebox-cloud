import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'data/**', 'files/**', 'backups/**', 'addons/**', 'agent/**', 'web/public/**'],
  },
  js.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': 'off',
      'no-undef': 'off',
      'no-useless-assignment': 'off',
      'no-control-regex': 'off',
      'svelte/require-each-key': 'off',
      'svelte/no-at-html-tags': 'off',
      'svelte/no-immutable-reactive-statements': 'off',
      'svelte/infinite-reactive-loop': 'off',
      'svelte/no-unused-svelte-ignore': 'off',
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
  },
];
