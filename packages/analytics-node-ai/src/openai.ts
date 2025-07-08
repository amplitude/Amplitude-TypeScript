import OpenAIOriginal, { ClientOptions } from 'openai';
import { NodeClient } from '@amplitude/analytics-types';
import type { APIPromise } from 'openai';
import type { Stream } from 'openai/streaming';

type ChatCompletion = OpenAIOriginal.ChatCompletion;
type ChatCompletionChunk = OpenAIOriginal.ChatCompletionChunk;
type ChatCompletionCreateParamsBase = OpenAIOriginal.Chat.Completions.ChatCompletionCreateParams;
type ChatCompletionCreateParamsNonStreaming = OpenAIOriginal.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
type ChatCompletionCreateParamsStreaming = OpenAIOriginal.Chat.Completions.ChatCompletionCreateParamsStreaming;

interface AmplitudeOpenAIConfig extends ClientOptions {
  amplitudeApiKey: string;
  amplitudeClient: NodeClient;
}

type RequestOptions = Record<string, any>;

export class AmplitudeOpenAI extends OpenAIOriginal {
  private readonly amplitudeClient: NodeClient;
  public chat: WrappedChat;

  constructor(config: AmplitudeOpenAIConfig) {
    const { amplitudeClient: amplitude, ...openAIConfig } = config;
    super(openAIConfig);
    this.amplitudeClient = amplitude;
    this.chat = new WrappedChat(this, this.amplitudeClient);
  }
}

export class WrappedChat extends OpenAIOriginal.Chat {
  constructor(parentClient: AmplitudeOpenAI, amplitudeClient: NodeClient) {
    super(parentClient);
    this.completions = new WrappedCompletions(parentClient, amplitudeClient);
  }

  public completions: WrappedCompletions;
}

export class WrappedCompletions extends OpenAIOriginal.Chat.Completions {
  private readonly amplitudeClient: NodeClient;

  constructor(client: OpenAIOriginal, amplitudeClient: NodeClient) {
    super(client);
    this.amplitudeClient = amplitudeClient;
  }

  // --- Overload #1: Non-streaming
  public create(body: ChatCompletionCreateParamsNonStreaming, options?: RequestOptions): APIPromise<ChatCompletion>;

  // --- Overload #2: Streaming
  public create(
    body: ChatCompletionCreateParamsStreaming,
    options?: RequestOptions,
  ): APIPromise<Stream<ChatCompletionChunk>>;

  // --- Overload #3: Generic base
  public create(
    body: ChatCompletionCreateParamsBase,
    options?: RequestOptions,
  ): APIPromise<ChatCompletion | Stream<ChatCompletionChunk>>;

  // --- Implementation Signature
  public create(
    body: ChatCompletionCreateParamsBase,
    options?: RequestOptions,
  ): APIPromise<ChatCompletion | Stream<ChatCompletionChunk>> {
    // Track user message event
    this.amplitudeClient.track('user message', {
      model: body.model,
      message_content: body.messages[0].content,
    });

    const parentPromise = super.create(body, options);

    if (body.stream) {
      return parentPromise.then((value) => {
        if ('tee' in value) {
          // Splits the stream into two streams which can be independently read from at different speeds.
          const [stream1, stream2] = value.tee();

          // Process stream in background to track agent message
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          (async () => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              for await (const _chunk of stream1) {
                // Just consume the stream to track completion
              }
              // Track agent message event
              this.trackAgentMessage();
            } catch (error) {
              console.error('Error tracking agent message:', error);
            }
          })();

          return stream2;
        }
        return value;
      }) as APIPromise<Stream<ChatCompletionChunk>>;
    } else {
      return parentPromise.then(
        async (result) => {
          if ('choices' in result) {
            // Track agent message event
            this.trackAgentMessage();
          }
          return result;
        },
        (error) => {
          console.error('Error in OpenAI completion:', error);
          throw error;
        },
      ) as APIPromise<ChatCompletion>;
    }
  }

  trackAgentMessage() {
    console.log('trackAgentMessage');
    this.amplitudeClient.track('agent message');
  }
}

export { AmplitudeOpenAI as OpenAI };
export default AmplitudeOpenAI;
