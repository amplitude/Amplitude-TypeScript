# TEST SERVER

This is a test server that serves HTML pages from this directory using Vite. The HTML pages are tagged with scripts that reference JS files from the packages directory.

If you have any use-cases of the SDK that you'd like to test, please add a new HTML page to this project and test it from there.

## DEV

To run this in 'dev' mode, from the root of this project, run `pnpm dev`. This will both watch for changes to the packages and update them as they change; and it will run a Vite dev server. This means that as you make changes to any of the JS files (or downstream files) that are referenced by the HTML page, the changes will be reflected immediately and the page will do a hot reload.

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

## Autocapture memory leak (SDK-702)

Open `/browser-sdk/autocapture-memory-leak.html` with `pnpm dev`. No API key is needed; remote config and real event uploads are disabled. The local mode imports the autocapture plugin source directly, so it tests the current checkout even if the Browser SDK bundle is stale. The published mode loads Browser SDK 2.49.0 from Amplitude's CDN.

Initialize the SDK, run the three-group cycle, collect garbage in Chrome DevTools' Memory panel, then click **Report counts**. The page keeps only weak references to the test buttons. After GC, the fixed source should retain zero exposed, briefly visible, and never-visible buttons. The affected published SDK should retain the first two groups. Reload to switch modes or disable Viewport Content Updated to check the workaround; do not navigate during a run.

## nuqs SPA

Run `pnpm dev:nuqs` for the [nuqs page-view example](./nuqs-spa/README.md) at http://127.0.0.1:5174/. Initialize the real SDK with a test project's API key, select `all` (default) or `pathOnly`, and observe page views from nuqs query-state updates.
