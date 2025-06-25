import { type Logger } from '@amplitude/analytics-types';
import { NativeSessionReplay, type NativeSessionReplayConfig } from './native-module';
import { getDefaultConfig, SessionReplayConfig } from './session-replay-config';

let fullConfig: Required<SessionReplayConfig> | null = null;
let isInitialized = false;

function logger(): Logger {
  return fullConfig?.logger ?? (console as unknown as Logger);
}

export async function init(config: SessionReplayConfig): Promise<void> {
  if (isInitialized) {
    logger().warn('SessionReplay is already initialized');
    return;
  }

  fullConfig = {
    ...getDefaultConfig(),
    ...config,
  };

  logger().log('Initializing SessionReplay with config: ', fullConfig);

  try {
    await NativeSessionReplay.setup(nativeConfig(fullConfig));
    logger().log('SessionReplay initialized');
    isInitialized = true;
  } catch (error) {
    logger().error('Error initializing SessionReplay', error);
  }
}

export async function setSessionId(sessionId: number): Promise<void> {
  if (!isInitialized) {
    logger().warn('SessionReplay is not initialized');
    return;
  }
  await NativeSessionReplay.setSessionId(sessionId);
}

export async function getSessionId(): Promise<number | null> {
  if (!isInitialized) {
    logger().warn('SessionReplay is not initialized');
    return null;
  }
  return await NativeSessionReplay.getSessionId();
}

export interface SessionReplayProperties {
  [key: string]: string | boolean | null;
}

export async function getSessionReplayProperties(): Promise<SessionReplayProperties | null> {
  if (!isInitialized) {
    logger().warn('SessionReplay is not initialized');
    return null;
  }
  const properties = await NativeSessionReplay.getSessionReplayProperties();
  return properties as SessionReplayProperties;
}

export async function flush(): Promise<void> {
  if (!isInitialized) {
    logger().warn('SessionReplay is not initialized');
    return;
  }
  await NativeSessionReplay.flush();
}

export async function shutdown(): Promise<void> {
  if (!isInitialized) {
    logger().warn('SessionReplay is not initialized');
    return;
  }
  await NativeSessionReplay.teardown();
  isInitialized = false;
}

function nativeConfig(config: Required<SessionReplayConfig>): NativeSessionReplayConfig {
  return {
    ...config,
    logLevel: config.logLevel as NativeSessionReplayConfig['logLevel'],
    maskLevel: config.maskLevel.toString() as NativeSessionReplayConfig['maskLevel'],
  };
}
