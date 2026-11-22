import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**']
  },
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        asset: 'readonly'
      },
      ecmaVersion: 2022,
      sourceType: 'script'
    },
    rules: {
      'no-unused-vars': ['error', { vars: 'local', caughtErrors: 'none' }],
      'no-console': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  }
];
