# TEST SERVER

This is a test server that serves HTML pages from this directory using Vite. The HTML pages are tagged with scripts that reference JS files from the packages directory.

If you have any use-cases of the SDK that you'd like to test, please add a new HTML page to this project and test it from there.

## DEV

To run this in 'dev' mode, from the root of this project, run `yarn dev`. This will both watch for changes to the packages and update them as they change; and it will run a Vite dev server. This means that as you make changes to any of the JS files (or downstream files) that are referenced by the HTML page, the changes will be reflected immediately and the page will do a hot reload.

## PROD

To run this in 'prod' mode, run `yarn build` and then run `yarn start`. This will build the assets and serve the statically. This mode currently has no use-case, but could be used in the future to run end-to-end tests. This will likely never be served in production as a web page because it's only for testing.

# HTTPS

To run the server as HTTPS follow these steps

1. add "local.website.com" to `/etc/hosts`
2. generate the certificates using the script "npm run generate-signed-cert"
3. add the cert.pem (at ~/certs/local-website/cert.pem) to the macOS keychain so that it's trusted by your browser
4. run `yarn dev:ssh` and it will open the website at https://local.website.com

## TIPS
* You can enable a "Workspace" in Chrome on this site, which allows you to edit the files from inside the browser
