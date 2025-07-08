import OpenAIOriginal from 'openai';

export class AmplitudeOpenAI extends OpenAIOriginal {
  /* istanbul ignore next */
  constructor(...args: ConstructorParameters<typeof OpenAIOriginal>) {
    super(...args);
  }
}

// Add more overrides here

export { AmplitudeOpenAI as OpenAI };
export default AmplitudeOpenAI;
