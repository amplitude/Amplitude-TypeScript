module.exports = {
  root: true,
  env: {
    es6: true,
    'jest/globals': true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018,
    project: 'packages/*/tsconfig.json',
    sourceType: 'module',
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'jest'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:jest/recommended',
    'prettier',
    "plugin:import/recommended",
  ],
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: 'packages/*/tsconfig.json',
      },
    },
  },
  rules: {
    '@typescript-eslint/member-delimiter-style': 0,
    '@typescript-eslint/no-explicit-any': 0,
    '@typescript-eslint/no-unused-vars': ['error', { vars: 'all', args: 'none', ignoreRestSiblings: true }],
    '@typescript-eslint/semi': 0,
    '@typescript-eslint/space-before-function-paren': 0,
    '@typescript-eslint/require-await': 0,
    'comma-dangle': 0,
    'new-cap': 0,
    'eol-last': [2, 'always'],
    'no-multiple-empty-lines': [2, { max: 1, maxEOF: 0 }],
    'no-restricted-globals': [
      'error',
      {
        name: 'globalThis',
        message: 'Unsafe access to `globalThis`.',
      },
      {
        name: 'window',
        message: 'Unsafe access to `window`.',
      },
      {
        name: 'self',
        message: 'Unsafe access to `self`.',
      },
    ],
    'import/no-extraneous-dependencies': [
      'error',
      {
        optionalDependencies: false,
      },
    ],
  },
  overrides: [
    {
      // Allow test files to access globals
      files: ['*.test.ts', '*.spec.ts'],
      rules: {
        'no-restricted-globals': 'off',
        'import/no-unresolved': 'off',
        'import/named': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        'import/no-extraneous-dependencies': 'off',
        'import/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
      },
    },
  ],
};
