import tseslint from 'typescript-eslint';

/**
 * ECC gates: no `any`, no `console.*` outside the logger, equality and
 * const discipline. Formatting belongs to Prettier, not ESLint.
 */
export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', 'public/'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['src/core/logger.ts'],
    rules: {
      // the logger is the ONLY module allowed to touch the console
      'no-console': 'off',
    },
  },
);
