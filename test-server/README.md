# TEST SERVER

This is a test server that serves HTML pages from this directory using Vite. The HTML pages are tagged with scripts that reference JS files from the packages directory.

If you have any use-cases of the SDK that you'd like to test, please add a new HTML page to this project and test it from there.

## DEV

To run this in 'dev' mode, from the root of this project, run `pnpm dev`. This will both watch for changes to the packages and update them as they change; and it will run a Vite dev server. This means that as you make changes to any of the JS files (or downstream files) that are referenced by the HTML page, the changes will be reflected immediately and the page will do a hot reload.

## Semantic Session Replay fixture

Run `pnpm dev:semantic` from the repository root to build the required packages and open [the semantic capture fixture](http://127.0.0.1:5174/session-replay-browser/sr-semantic-test.html). It uses the real Session Replay SDK with local config/transport callbacks, so no API key or Amplitude uploads are needed. Its inspector validates received `amp-semantic/*` rrweb events, shows payloads, and exports JSON.

Run `pnpm test:semantic` for the accompanying Playwright integration suite. See [amp-semantic validation](../packages/amp-semantic/README.md#validation) for controls and coverage. The fixture is also available from the normal `pnpm dev` test-server index.

## PROD

To run this in 'prod' mode, run `pnpm build` and then run `pnpm start`. This will build the assets and serve the statically. This mode currently has no use-case, but could be used in the future to run end-to-end tests. This will likely never be served in production as a web page because it's only for testing.

# HTTPS

To run the server as HTTPS follow these steps

1. add "local.website.com" to `/etc/hosts`
2. generate the certificates using the script "npm run generate-signed-cert"
3. add the cert.pem (at ~/certs/local-website/cert.pem) to the macOS keychain so that it's trusted by your browser
4. run `pnpm dev:ssh` and it will open the website at https://local.website.com

## TIPS
* You can enable a "Workspace" in Chrome on this site, which allows you to edit the files from inside the browser
