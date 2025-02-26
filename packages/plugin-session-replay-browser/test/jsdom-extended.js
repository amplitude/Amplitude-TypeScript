const JSDOMEnvironment = require('jest-environment-jsdom').default; // or import JSDOMEnvironment from 'jest-environment-jsdom' if you are using ESM modules

class JSDOMEnvironmentExtended extends JSDOMEnvironment {
  constructor(...args) {
    super(...args);

    this.global.ReadableStream = ReadableStream;
    this.global.TextDecoder = TextDecoder;
    this.global.TextEncoder = TextEncoder;
    this.global.BroadcastChannel = BroadcastChannel;
    this.global.TransformStream = TransformStream;

    this.global.Blob = Blob;
    this.global.structuredClone = structuredClone;
  }
}

module.exports = JSDOMEnvironmentExtended;
