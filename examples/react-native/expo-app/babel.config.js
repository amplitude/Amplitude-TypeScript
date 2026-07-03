module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      '@amplitude/babel-plugin-autocapture-transformer',
      // Inlines AMPLITUDE_API_KEY from the shell environment at bundle time.
      // `export AMPLITUDE_API_KEY=…` before `pnpm run android` / `pnpm run ios`.
      [
        'transform-inline-environment-variables',
        {include: ['AMPLITUDE_API_KEY', 'TEST_SERVER_HOST']},
      ],
    ],
  };
};
