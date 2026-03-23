import { EventData, Events, SendingSequencesReturn } from '../typings/session-replay';
import { BaseEventsStore } from './base-events-store';

export class InMemoryEventsStore extends BaseEventsStore<number> {
  private finalizedSequences: Record<number, { sessionId: string | number; events: EventData[] }> = {};
  private sequences: Record<string | number, EventData[]> = {};
  private batchSizes: Map<string | number, number> = new Map();
  private sequenceId = 0;

  private resetCurrentSequence(sessionId: string | number) {
    this.sequences[sessionId] = [];
    this.batchSizes.set(sessionId, 0);
  }

  private addSequence(sessionId: string | number): SendingSequencesReturn<number> {
    const sequenceId = this.sequenceId++;
    const events = [...this.sequences[sessionId]];
    this.finalizedSequences[sequenceId] = { sessionId, events };
    this.resetCurrentSequence(sessionId);
    return { sequenceId, events, sessionId };
  }

  async getSequencesToSend(): Promise<SendingSequencesReturn<number>[] | undefined> {
    return Object.entries(this.finalizedSequences).map(([sequenceId, { sessionId, events }]) => ({
      sequenceId: Number(sequenceId),
      sessionId,
      events,
    }));
  }

  async storeCurrentSequence(sessionId: string | number): Promise<SendingSequencesReturn<number> | undefined> {
    if (!this.sequences[sessionId]) {
      return undefined;
    }
    return this.addSequence(sessionId);
  }

  async addEventToCurrentSequence(
    sessionId: number,
    event: EventData,
  ): Promise<SendingSequencesReturn<number> | undefined> {
    if (!this.sequences[sessionId]) {
      this.resetCurrentSequence(sessionId);
    }

    let sequenceReturn: SendingSequencesReturn<number> | undefined;
    const currentBatchSize = this.batchSizes.get(sessionId) ?? 0;
    if (this.shouldSplitEventsList(currentBatchSize, event, this.sequences[sessionId].length > 0)) {
      sequenceReturn = this.addSequence(sessionId); // resets batchSizes via resetCurrentSequence
    }

    this.sequences[sessionId].push(event);
    this.batchSizes.set(sessionId, (this.batchSizes.get(sessionId) ?? 0) + this.getEventSize(event));

    return sequenceReturn;
  }

  async storeSendingEvents(sessionId: number, events: Events): Promise<number | undefined> {
    this.finalizedSequences[this.sequenceId] = { sessionId, events };

    return this.sequenceId++;
  }

  async cleanUpSessionEventsStore(_sessionId: number, sequenceId?: number): Promise<void> {
    if (sequenceId !== undefined) {
      delete this.finalizedSequences[sequenceId];
    }
  }
}
