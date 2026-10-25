/**
 * Test-only exam, served at /modules/__fixture/exam/ when the site is built with
 * NETLEARN_FIXTURES=1 (or in `astro dev`). Real exams live in src/content/exams; this never ships.
 * tests/e2e/engine.spec.ts answers it by prompt, so keep prompts unique.
 */
import { examSchema, type Exam } from '../content/schemas';

export const FIXTURE_MODULE_ID = '__fixture';

export const fixtureExam: Exam = examSchema.parse({
  title: 'Fixture exam',
  drawCount: 4,
  passPct: 75,
  timeLimitMin: 10,
  questions: [
    {
      id: 'fx-port',
      type: 'single',
      prompt: 'Fixture: which field picks the program on a machine?',
      options: ['IP address', 'Port', 'TTL'],
      answer: 1,
      explanation: 'The port identifies the program.',
      difficulty: 1,
    },
    {
      id: 'fx-udp',
      type: 'truefalse',
      prompt: 'Fixture: UDP guarantees ordering.',
      answer: false,
      explanation: 'UDP guarantees nothing about order.',
      difficulty: 1,
    },
    {
      id: 'fx-tick',
      type: 'numeric',
      prompt: 'Fixture: how many milliseconds between ticks at 50 Hz?',
      answer: 20,
      tolerance: 0,
      unit: 'ms',
      explanation: '1000 / 50 = 20 ms.',
      difficulty: 2,
    },
    {
      id: 'fx-fill',
      type: 'fill',
      prompt: 'Fixture: name the transport protocol with a three-way handshake.',
      answers: ['TCP'],
      explanation: 'TCP opens connections with SYN, SYN-ACK, ACK.',
      difficulty: 2,
    },
    {
      id: 'fx-multi',
      type: 'multi',
      prompt: 'Fixture: which of these are reliable delivery modes?',
      options: ['Reliable ordered', 'Unreliable', 'Reliable unordered'],
      answers: [0, 2],
      explanation: 'Both reliable modes retransmit.',
      difficulty: 3,
    },
  ],
});

export const fixturesEnabled = () => import.meta.env.DEV || process.env.NETLEARN_FIXTURES === '1';
