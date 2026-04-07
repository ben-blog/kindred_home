import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['dred/d2/api/**', 'node_modules/**']
  },
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        html2canvas: 'readonly'
      },
      ecmaVersion: 2022,
      sourceType: 'module'
    },
    rules: {
      'no-unused-vars': 'error',
      'no-console': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  }
];
