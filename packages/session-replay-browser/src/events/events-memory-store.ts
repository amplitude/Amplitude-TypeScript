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

  // Sampled (1 in 100) debug log so we can observe whether the store-layer guards
  // are actually catching cases that would otherwise hit the empty-body 400 path on
  // the server. Logged at debug, not warn — this is operational telemetry for
  // post-deploy verification, not a customer-actionable warning. Per-store-instance
  // counter rather than Math.random keeps the first hit deterministic for tests.
  private maybeLogEmptyFiltered(source: string) {
    if (this.emptyFilteredCount++ % 100 === 0) {
      this.loggerProvider.debug(`Filtered empty session replay sequence at ${source} (in-memory store)`);
    }
  }

  async getSequencesToSend(): Promise<SendingSequencesReturn<number>[] | undefined> {
    const result: SendingSequencesReturn<number>[] = [];
    for (const [sequenceId, { sessionId, events }] of Object.entries(this.finalizedSequences)) {
      if (events.length === 0) {
        // Prune in-place for consistency with the IDB store: by construction we
        // never write empty sequences anymore, so any empty entry is unambiguously
        // stale residue. Without the delete, every subsequent getSequencesToSend
        // would re-iterate the empty entry and re-fire the sampled log, producing
        // repeated noise that's indistinguishable from active bug occurrences.
        this.maybeLogEmptyFiltered('getSequencesToSend');
        delete this.finalizedSequences[Number(sequenceId)];
        continue;
      }
      result.push({ sequenceId: Number(sequenceId), sessionId, events });
    }
    return result;
  }

  async storeCurrentSequence(sessionId: string | number): Promise<SendingSequencesReturn<number> | undefined> {
    const buffered = this.sequences[sessionId];
    if (!buffered) {
      return undefined;
    }
    if (buffered.length === 0) {
      // Slot exists but is empty (e.g. drained by a prior storeCurrentSequence then
      // re-flushed before any new event landed). Don't finalize a zero-event row.
      this.maybeLogEmptyFiltered('storeCurrentSequence');
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
    // shouldSplitEventsList can return true with an empty buffer when a single
    // incoming event is larger than MAX_EVENT_LIST_SIZE (2 MB) — the size-constraint
    // branch fires regardless of current length. Don't finalize a zero-event sequence
    // (the SR-4284 root cause); just hold the incoming event in the buffer.
    // shouldSplitEventsList's time-elapsed branch only fires when events.length > 0
    // (see base-events-store.ts), so calling it on an empty buffer has no side effects.
    if (this.shouldSplitEventsList(this.sequences[sessionId], event)) {
      if (this.sequences[sessionId].length === 0) {
        this.maybeLogEmptyFiltered('addEventToCurrentSequence');
      } else {
        sequenceReturn = this.addSequence(sessionId);
      }
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
