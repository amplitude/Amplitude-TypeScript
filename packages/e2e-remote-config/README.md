<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/brand/amplitude-logo-with-text.svg" width="280">
  </a>
  <br />
</p>

# E2E Remote Config

A place for E2E tests that test the Remote Config functionality. Tests against a matrix of SDK versions and API Keys.

## API key configuration

Provide public Analytics project API keys through environment variables instead of committing them to the test scripts. These are client-side keys and remain visible to the browser; do not use a project secret key.

The production matrix requires all three variables before running `pnpm test:e2e:remote-config`:

| Variable | Project configuration |
| --- | --- |
| `REMOTE_CONFIG_EMPTY_API_KEY` | Empty remote configuration |
| `REMOTE_CONFIG_NESTED_API_KEY` | Nested remote configuration |
| `REMOTE_CONFIG_DEFAULT_API_KEY` | Default remote configuration |

Use the existing test projects with these configurations. The script checks that all three variables are nonempty before starting any tests. It runs the empty-config case against the current/latest SDK (or an inherited `AMPLITUDE_VERSION`) and all three cases against the pinned SDK versions.

For `pnpm test:e2e:remote-config:staging`, set `REMOTE_CONFIG_STAGING_API_KEY` to the staging test project's public key.

For a single Playwright run, set `API_KEY` in the test process. Without that override, the browser fixture uses `VITE_AMPLITUDE_API_KEY` from the root `.env` file or the Vite process environment, as the existing E2E CI action already does. Vite embeds this value at build time, so set it before `pnpm build:vite`. The browser fixture reports a configuration error if neither value is present.

Keep local values in the ignored root `.env` file or export them in your shell; the matrix scripts do not load `.env` automatically. A CI job running the matrix should inject the matching variables from its configured environment or secrets.
