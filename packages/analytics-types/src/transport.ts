import { TransportResponse } from './response';

export interface Transport {
  send(serverUrl: string, payload: Record<string, any>): Promise<TransportResponse>;
}
