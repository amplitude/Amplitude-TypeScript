import OpenAIOriginal, { ClientOptions } from 'openai';
import { NodeClient } from '@amplitude/analytics-types';
import type { APIPromise } from 'openai';
import type { Stream } from 'openai/streaming';

type ChatCompletion = OpenAIOriginal.ChatCompletion;
type ChatCompletionChunk = OpenAIOriginal.ChatCompletionChunk;
type ChatCompletionCreateParamsBase = OpenAIOriginal.Chat.Completions.ChatCompletionCreateParams;
type ChatCompletionCreateParamsNonStreaming = OpenAIOriginal.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
type ChatCompletionCreateParamsStreaming = OpenAIOriginal.Chat.Completions.ChatCompletionCreateParamsStreaming;

// Extended types with Amplitude properties
type AmplitudeExtendedParamsBase = ChatCompletionCreateParamsBase & {
  amplitudeUserId?: string;
  amplitudeDeviceId?: string;
  amplitudeSessionId?: number;
};

type AmplitudeExtendedParamsNonStreaming = ChatCompletionCreateParamsNonStreaming & {
  amplitudeUserId?: string;
  amplitudeDeviceId?: string;
  amplitudeSessionId?: number;
};

type AmplitudeExtendedParamsStreaming = ChatCompletionCreateParamsStreaming & {
  amplitudeUserId?: string;
  amplitudeDeviceId?: string;
  amplitudeSessionId?: number;
};

interface AmplitudeOpenAIConfig extends ClientOptions {
  amplitudeApiKey: string;
  amplitudeClient: NodeClient;
}

// TODO(Xinyi): Should be more strict
// Original type: https://github.com/openai/openai-node/blob/862e36338c9f64881bd5b23b79fa3380742b80be/src/internal/request-options.ts#L12
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
  public create(body: AmplitudeExtendedParamsNonStreaming, options?: RequestOptions): APIPromise<ChatCompletion>;

  // --- Overload #2: Streaming
  public create(
    body: AmplitudeExtendedParamsStreaming,
    options?: RequestOptions,
  ): APIPromise<Stream<ChatCompletionChunk>>;

  // --- Overload #3: Generic base
  public create(
    body: AmplitudeExtendedParamsBase,
    options?: RequestOptions,
  ): APIPromise<ChatCompletion | Stream<ChatCompletionChunk>>;

  // --- Implementation Signature
  public create(
    body: AmplitudeExtendedParamsBase,
    options?: RequestOptions,
  ): APIPromise<ChatCompletion | Stream<ChatCompletionChunk>> {
    // Extract Amplitude-specific properties
    const { amplitudeUserId, amplitudeDeviceId, amplitudeSessionId, ...openAIBody } = body;

    // Track user message event
    this.amplitudeClient.track(
      'user message',
      {
        model: body.model,
        message_content: body.messages[0].content,
      },
      {
        user_id: amplitudeUserId,
        device_id: amplitudeDeviceId,
        session_id: amplitudeSessionId,
      },
    );

    const parentPromise = super.create(openAIBody as ChatCompletionCreateParamsBase, options);

    if (body.stream) {
      return parentPromise.then((value) => {
        if ('tee' in value) {
          // Splits the stream into two streams which can be independently read from at different speeds.
          const [stream1, stream2] = (value as Stream<ChatCompletionChunk>).tee();

          // Process stream in background to track agent message
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          (async () => {
            try {
              let responseContent = '';
              let promptTokens = 0;
              let completionTokens = 0;
              let totalTokens = 0;

              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              for await (const chunk of stream1) {
                // Collect response content from chunks
                if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
                  responseContent += chunk.choices[0].delta.content;
                }

                // Extract token usage from the final chunk
                if (chunk.usage) {
                  promptTokens = chunk.usage.prompt_tokens || 0;
                  completionTokens = chunk.usage.completion_tokens || 0;
                  totalTokens = chunk.usage.total_tokens || 0;
                }
              }

              // Track agent message event
              this.amplitudeClient.track(
                'agent message',
                {
                  model: body.model,
                  message_content: responseContent,
                  input_tokens: promptTokens,
                  output_tokens: completionTokens,
                  total_tokens: totalTokens,
                },
                {
                  user_id: amplitudeUserId,
                  device_id: amplitudeDeviceId,
                  session_id: amplitudeSessionId,
                },
              );
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
            this.amplitudeClient.track(
              'agent message',
              {
                model: body.model,
                message_content: result.choices[0]?.message?.content || '',
                input_tokens: result.usage?.prompt_tokens || 0,
                output_tokens: result.usage?.completion_tokens || 0,
                total_tokens: result.usage?.total_tokens || 0,
              },
              {
                user_id: amplitudeUserId,
                device_id: amplitudeDeviceId,
                session_id: amplitudeSessionId,
              },
            );
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
}

export { AmplitudeOpenAI as OpenAI };
export default AmplitudeOpenAI;
