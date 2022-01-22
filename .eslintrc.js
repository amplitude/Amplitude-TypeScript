module.exports = {
  root: true,
  env: {
    es6: true,
    'jest/globals': true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018,
    project: "packages/*/tsconfig.json",
    sourceType: 'module',
    tsconfigRootDir: __dirname,
  },
  plugins: [
    '@typescript-eslint',
    'jest',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:jest/recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/member-delimiter-style': 0,
    '@typescript-eslint/no-explicit-any': 0,
    '@typescript-eslint/semi': 0,
    '@typescript-eslint/space-before-function-paren': 0,
    'comma-dangle': 0,
    'new-cap': 0,
    'eol-last': [2, "always"],
    'no-multiple-empty-lines': [2, { max: 1, maxEOF: 0 }],
  },
};
