import { Response } from './response';

export interface Transport {
  send(serverUrl: string, payload: Record<string, any>): Promise<Response | null>;
}
