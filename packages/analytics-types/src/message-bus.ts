export interface MessageBus {
  subscribeAll(callback: MessageBusCallback): () => void;
  emit(messageType: string | symbol, args: any[]): void;
}

export interface MessageBusState {
  messageType: string | symbol;
  args: any[];
}

export type MessageBusCallback = (state: MessageBusState) => unknown | Promise<unknown>;
