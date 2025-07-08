import { NodeClient } from '@amplitude/analytics-types';
import OpenAIOriginal from 'openai';

type ChatCompletionCreateParamsBase = OpenAIOriginal.Chat.Completions.ChatCompletionCreateParams;

interface AmplitudeTrackingParams {
  amplitudeUserId?: string;
  amplitudeDeviceId?: string;
  amplitudeSessionId?: number;
}

export function trackAgentError(
  amplitudeClient: NodeClient,
  error: any,
  body: ChatCompletionCreateParamsBase & AmplitudeTrackingParams,
  startTime: number,
  amplitudeUserId?: string,
  amplitudeDeviceId?: string,
  amplitudeSessionId?: number,
) {
  const latency = Date.now() - startTime;

  // Extract error information
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  const errorMessage: string = error?.message || error?.toString() || 'Unknown error';
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const errorType: string = error?.type || error?.code || 'unknown';
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const errorCode: number | null = error?.code || error?.status || null;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const requestId: string | null = error?.request_id || null;

  amplitudeClient.track(
    'agent error',
    {
      model: body.model,
      message_content: body.messages[0]?.content || '',
      error_message: errorMessage,
      error_type: errorType,
      error_code: errorCode,
      latency: latency,
      request_id: requestId,
      api_endpoint: 'chat.completions',
    },
    {
      user_id: amplitudeUserId,
      device_id: amplitudeDeviceId,
      session_id: amplitudeSessionId,
    },
  );
}

export function trackUserMessage(
  amplitudeClient: NodeClient,
  model: string,
  messageContent: any,
  trackingParams: AmplitudeTrackingParams,
) {
  amplitudeClient.track(
    'user message',
    {
      model: model,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      message_content: messageContent,
    },
    {
      user_id: trackingParams.amplitudeUserId,
      device_id: trackingParams.amplitudeDeviceId,
      session_id: trackingParams.amplitudeSessionId,
    },
  );
}

export function trackAgentMessage(
  amplitudeClient: NodeClient,
  model: string,
  messageContent: string,
  inputTokens: number,
  outputTokens: number,
  totalTokens: number,
  latency: number,
  trackingParams: AmplitudeTrackingParams,
) {
  amplitudeClient.track(
    'agent message',
    {
      model: model,
      message_content: messageContent,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      latency: latency,
    },
    {
      user_id: trackingParams.amplitudeUserId,
      device_id: trackingParams.amplitudeDeviceId,
      session_id: trackingParams.amplitudeSessionId,
    },
  );
}
