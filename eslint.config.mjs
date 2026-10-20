import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import react from 'eslint-plugin-react';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'src/lib/version.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      'react-hooks': reactHooks,
      react,
      'jsx-a11y': jsxA11y,
      'unused-imports': unusedImports,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...jsxA11y.configs.recommended.rules,
      // TypeScript types the props; prose in JSX uses plain apostrophes and quotes.
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      // Components such as <Calendar autoFocus> or <CrossSignSlot role="signer"> are not DOM elements.
      'jsx-a11y/aria-role': ['error', { ignoreNonDOM: true }],
      'jsx-a11y/no-autofocus': ['error', { ignoreNonDOM: true }],
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': ['warn', {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
      }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
