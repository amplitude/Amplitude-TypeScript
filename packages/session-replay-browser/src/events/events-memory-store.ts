import { Events, SendingSequencesReturn } from '../typings/session-replay';
import { BaseEventsStore } from './base-events-store';

export class InMemoryEventsStore extends BaseEventsStore<number, void> {
  private finalizedSequences: Record<number, { sessionId: number; events: string[] }> = {};
  private sequences: Record<number, string[]> = {};
  private sequenceId = 0;

  private async addSequence(sessionId: number, events: Events): Promise<SendingSequencesReturn<number>> {
    const sequenceId = this.sequenceId++;
    this.finalizedSequences[sequenceId] = { sessionId, events };
    await this.resetCurrentSequence(sessionId);
    return { sequenceId, events, sessionId };
  }

  async startTransaction(): Promise<void> {
    return;
  }

  async finishTransaction(): Promise<void> {
    return;
  }

  async getCurrentSequence(sessionId: number): Promise<Events> {
    return this.sequences[sessionId];
  }

  async addToCurrentSequence(sessionId: number, event: string): Promise<void> {
    this.sequences[sessionId].push(event);
  }

  async persistSequence(sessionId: number, events?: Events): Promise<SendingSequencesReturn<number> | undefined> {
    if (events) {
      return await this.addSequence(sessionId, events);
    }

    if (!this.sequences[sessionId]) {
      return undefined;
    }

    return await this.addSequence(sessionId, [...this.sequences[sessionId]]);
  }

  async resetCurrentSequence(sessionId: number) {
    this.sequences[sessionId] = [];
  }

  async getPersistedSequences(limit?: number): Promise<SendingSequencesReturn<number>[]> {
    const sequences = [];
    for (const [sequenceId, { sessionId, events }] of Object.entries(this.finalizedSequences)) {
      sequences.push({
        sequenceId: Number(sequenceId),
        sessionId,
        events,
      });
      if (limit !== undefined) {
        limit--;
        if (limit <= 0) {
          return sequences;
        }
      }
    }
    return sequences;
  }

  async deleteSequence(_sessionId: number, sequenceId?: number): Promise<void> {
    if (sequenceId !== undefined) {
      delete this.finalizedSequences[sequenceId];
    }
  }
}
