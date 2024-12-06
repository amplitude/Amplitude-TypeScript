import { Events, SendingSequencesReturn } from '../typings/session-replay';
import { BaseEventsStore } from './base-events-store';

export class InMemoryEventsStore extends BaseEventsStore<number> {
  private finalizedSequences: Record<number, { sessionId: string | number; events: string[] }> = {};
  private sequences: Record<string | number, string[]> = {};
  private sequenceId = 0;

  private resetCurrentSequence(sessionId: string | number) {
    this.sequences[sessionId] = [];
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
    event: string,
  ): Promise<SendingSequencesReturn<number> | undefined> {
    if (!this.sequences[sessionId]) {
      this.resetCurrentSequence(sessionId);
    }

    let sequenceReturn: SendingSequencesReturn<number> | undefined;
    if (this.shouldSplitEventsList(this.sequences[sessionId], event)) {
      sequenceReturn = this.addSequence(sessionId);
    }

    this.sequences[sessionId].push(event);

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
