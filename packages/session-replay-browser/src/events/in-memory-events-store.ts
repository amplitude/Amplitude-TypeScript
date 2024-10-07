import { MAX_EVENT_LIST_SIZE_IN_BYTES } from '../constants';
import { Events, EventsStore, SendingSequencesReturn } from '../typings/session-replay';

export class InMemoryEventsStore implements EventsStore<number> {
  private finalizedSequences: Record<number, { sessionId: number; events: string[] }> = {};
  private sequences: Record<number, string[]> = {};
  private sequenceLengths: Record<number, number> = {};
  private sequenceId = 0;

  private resetCurrentSequence(sessionId: number) {
    this.sequences[sessionId] = [];
    this.sequenceLengths[sessionId] = 0;
  }

  async getSequencesToSend(): Promise<SendingSequencesReturn<number>[] | undefined> {
    const sequenceNumbers: SendingSequencesReturn<number>[] = [];
    for (const [sequenceId, { sessionId, events }] of Object.entries(this.finalizedSequences)) {
      sequenceNumbers.push({
        events,
        sequenceId: Number(sequenceId),
        sessionId,
      });
    }

    return sequenceNumbers;
  }

  async storeCurrentSequence(sessionId: number): Promise<SendingSequencesReturn<number> | undefined> {
    if (!this.sequences[sessionId]) {
      return undefined;
    }

    this.finalizedSequences[this.sequenceId] = { sessionId, events: this.sequences[sessionId] };
    this.resetCurrentSequence(sessionId);
    return {
      events: this.finalizedSequences[this.sequenceId].events,
      sequenceId: this.sequenceId++,
      sessionId,
    };
  }

  async addEventToCurrentSequence(
    sessionId: number,
    event: string,
  ): Promise<SendingSequencesReturn<number> | undefined> {
    if (!this.sequences[sessionId]) {
      this.resetCurrentSequence(sessionId);
    }

    if (this.sequenceLengths[sessionId] + event.length > MAX_EVENT_LIST_SIZE_IN_BYTES) {
      await this.storeCurrentSequence(sessionId);
    }

    this.sequences[sessionId].push(event);
    this.sequenceLengths[sessionId] += event.length;
    return undefined;
  }

  async storeSendingEvents(sessionId: number, events: Events): Promise<number | undefined> {
    this.finalizedSequences[this.sequenceId++] = { sessionId, events };
    return undefined;
  }

  async cleanUpSessionEventsStore(sessionId: number, sequenceId: number): Promise<void> {
    delete this.finalizedSequences[sequenceId];
    this.resetCurrentSequence(sessionId);
  }
}
