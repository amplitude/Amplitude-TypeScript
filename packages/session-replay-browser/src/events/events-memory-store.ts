import { Events, SendingSequencesReturn } from '../typings/session-replay';
import { BaseEventsStore } from './base-events-store';

export class InMemoryEventsStore extends BaseEventsStore<number> {
  private finalizedSequences: Record<number, { sessionId: string | number; events: string[] }> = {};
  private sequences: Record<string | number, string[]> = {};
  private sequenceId = 0;
  private emptyFilteredCount = 0;

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

  // Sampled (1 in 100) warn so we can observe whether the store-layer guards are
  // actually catching cases that would otherwise hit the empty-body 400 path on the
  // server. Per-store-instance counter rather than Math.random keeps the first hit
  // deterministic for tests and visible in dev consoles.
  private maybeWarnEmptyFiltered(source: string) {
    if (this.emptyFilteredCount++ % 100 === 0) {
      this.loggerProvider.warn(`Filtered empty session replay sequence at ${source} (in-memory store)`);
    }
  }

  async getSequencesToSend(): Promise<SendingSequencesReturn<number>[] | undefined> {
    const result: SendingSequencesReturn<number>[] = [];
    for (const [sequenceId, { sessionId, events }] of Object.entries(this.finalizedSequences)) {
      if (events.length === 0) {
        this.maybeWarnEmptyFiltered('getSequencesToSend');
        continue;
      }
      result.push({ sequenceId: Number(sequenceId), sessionId, events });
    }
    return result;
  }

  async storeCurrentSequence(sessionId: string | number): Promise<SendingSequencesReturn<number> | undefined> {
    const buffered = this.sequences[sessionId];
    if (!buffered || buffered.length === 0) {
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
    // Only finalize a split batch when there's something to send. shouldSplitEventsList
    // can return true with an empty buffer when a single incoming event is larger than
    // MAX_EVENT_LIST_SIZE (700 KB) — the size-constraint branch fires regardless of
    // current length. Without this guard we'd finalize an empty sequence that the
    // network layer would later POST as an empty body (the SR-4284 root cause).
    if (this.sequences[sessionId].length > 0 && this.shouldSplitEventsList(this.sequences[sessionId], event)) {
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
