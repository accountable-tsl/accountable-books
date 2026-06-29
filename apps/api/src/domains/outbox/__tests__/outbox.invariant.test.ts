import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

function readSource(relPath: string): string {
  return readFileSync(join(here, relPath), 'utf8');
}

/**
 * Guard the core invariant: a worker-backed outbox handler must DO the work and
 * let the dispatcher mark the row processed only on success. It must never relay
 * the work into a second BullMQ queue and return — that is the "ticked off
 * before it's actually done" bug this whole effort removed.
 *
 * `enqueueGLBalance(` / `enqueueCloseSignalEval(` are the relay calls; the
 * `...Input` schema identifiers don't match because of the trailing `(`.
 */
describe('outbox invariant: handlers do the work, never relay into a second queue', () => {
  it('GL balance handler does not re-enqueue into the balance-recalc queue', () => {
    const src = readSource('../../balances/gl-balance.outbox.ts');
    expect(src).not.toContain('enqueueGLBalance(');
  });

  it('close-signal handler does not re-enqueue into the close-signal-eval queue', () => {
    const src = readSource(
      '../../reporting/close-readiness/signals/close-signal.outbox.ts',
    );
    expect(src).not.toContain('enqueueCloseSignalEval(');
  });
});
