<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# Amplitude-TypeScript

This is Amplitude's latest version of the JavaScript SDK, written in TypeScript.
## Development

If you plan on contributing to this SDK, here's how you can start.

1. Clone GitHub repo
2. Install dependencies
3. Build and link packages

```
$ git clone git@github.com:amplitude/Amplitude-TypeScript.git
$ yarn
$ yarn build
```

Check our guidelines for repo contributions on [CONTRIBUTING.md](https://github.com/amplitude/Amplitude-TypeScript/blob/main/CONTRIBUTING.md).

## Projects

* Amplitude SDK for Web
  * [@amplitude/analytics-browser@^2](https://github.com/amplitude/Amplitude-TypeScript/tree/main/packages/analytics-browser)
  * [@amplitude/analytics-browser@^1](https://github.com/amplitude/Amplitude-TypeScript/tree/v1.x/packages/analytics-browser)
  * [Installation and Quick Start](https://www.docs.developers.amplitude.com/data/sdks/browser-2/)
* Amplitude SDK for Node.js
  * [@amplitude/analytics-node](https://github.com/amplitude/Amplitude-TypeScript/tree/main/packages/analytics-node)
  * [Installation and Quick Start](https://www.docs.developers.amplitude.com/data/sdks/typescript-node/)
* Amplitude SDK for React Native
  * [@amplitude/analytics-react-native](https://github.com/amplitude/Amplitude-TypeScript/tree/main/packages/analytics-react-native)
  * [Installation and Quick Start](https://www.docs.developers.amplitude.com/data/sdks/typescript-react-native/)

## Testing Locally

To test the SDK locally, you can run our test server.

Before running the test server for the first time, copy ".env.example" as ".env" and replace the variables in '.env' with your own variables.

Run `yarn dev` to run the test server. It will open up to the home page automatically in your default browser.

For more details visit the [Test Server README.md](/test-server/README.md)

## Documentation

See our [Typescript SDK](https://amplitude.github.io/Amplitude-TypeScript/) Reference for a list and description of all available SDK methods.
