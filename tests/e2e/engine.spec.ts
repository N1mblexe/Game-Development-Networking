import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { parse } from 'yaml';
import { fixtureExam } from '../../src/lib/quiz/fixtures';

type Q = {
  id: string;
  type: string;
  options?: string[];
  answer?: number | boolean;
  answers?: (number | string)[];
  items?: string[];
  answerLines?: number[];
};

const golden: { passPct: number; questions: Q[] } = parse(
  readFileSync('src/content/quizzes/theory/packets-and-protocols.yaml', 'utf8'),
);
const LESSON = '/modules/theory/packets-and-protocols/';

/** Answer one rendered question correctly (or deliberately wrong for single choice). */
async function answer(scope: Locator, q: Q, wrong = false) {
  switch (q.type) {
    case 'single': {
      const idx = wrong ? ((q.answer as number) + 1) % q.options!.length : (q.answer as number);
      await scope.getByRole('radio', { name: q.options![idx], exact: true }).check();
      break;
    }
    case 'multi':
      for (const i of q.answers as number[]) await scope.getByRole('checkbox', { name: q.options![i], exact: true }).check();
      break;
    case 'truefalse':
      await scope.getByRole('radio', { name: q.answer ? 'True' : 'False', exact: true }).check();
      break;
    case 'order':
      for (let target = 0; target < q.items!.length; target++) {
        const current = await scope.locator('[data-item]').evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.item)));
        for (let pos = current.indexOf(target); pos > target; pos--)
          await scope.getByRole('button', { name: `Move "${q.items![target]}" up` }).click();
      }
      break;
    case 'codeline':
      for (const line of q.answerLines!) await scope.getByRole('button', { name: new RegExp(`^Line ${line}:`) }).click();
      break;
    case 'fill':
      await scope.getByRole('textbox').fill(String(q.answers![0]));
      break;
    case 'numeric':
      await scope.getByRole('textbox').fill(String(q.answer));
      break;
  }
}

async function openQuiz(page: Page) {
  await page.goto(LESSON);
  const quiz = page.locator('[data-quiz]');
  await quiz.scrollIntoViewIfNeeded();
  await expect(quiz).toHaveAttribute('data-ready', 'true');
  return quiz;
}

test.describe('lesson quiz', () => {
  test('answering the golden quiz correctly passes and completes the lesson', async ({ page }) => {
    const quiz = await openQuiz(page);
    await expect(page.locator('[data-mark-complete]')).toHaveAttribute('aria-pressed', 'false');

    for (const [i, q] of golden.questions.entries()) {
      const scope = quiz.locator(`[data-question="${q.id}"]`);
      await expect(scope).toBeVisible();
      await answer(scope, q);
      await quiz.getByRole('button', { name: 'Check' }).click();
      await expect(quiz.locator('[data-feedback]')).toHaveAttribute('data-feedback', 'correct');
      await expect(quiz.locator('[data-feedback]')).toBeFocused();
      await quiz.getByRole('button', { name: i < golden.questions.length - 1 ? /Next question/ : /See results/ }).click();
    }

    await expect(quiz.getByRole('heading', { name: 'Passed' })).toBeVisible();
    await expect(quiz).toContainText(`${golden.questions.length} of ${golden.questions.length} correct`);
    await expect(page.locator('[data-mark-complete]')).toHaveAttribute('aria-pressed', 'true');

    await page.reload();
    const again = await openQuiz(page);
    await expect(again).toContainText('best 100%');
    await expect(page.locator('[data-mark-complete]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('wrong answers show feedback, can be reviewed, and retry starts over', async ({ page }) => {
    const quiz = await openQuiz(page);
    const [first, ...rest] = golden.questions;
    await quiz.getByRole('button', { name: 'Check' }).click();
    await expect(quiz).toContainText('Answer the question first.');

    await answer(quiz.locator(`[data-question="${first.id}"]`), first, true);
    await quiz.getByRole('button', { name: 'Check' }).click();
    await expect(quiz.locator('[data-feedback]')).toHaveAttribute('data-feedback', 'wrong');
    await expect(quiz.locator('[data-feedback]')).toContainText('Not quite');
    await quiz.getByRole('button', { name: /Next question/ }).click();

    for (const q of rest) {
      await answer(quiz.locator(`[data-question="${q.id}"]`), q);
      await quiz.getByRole('button', { name: 'Check' }).click();
      await quiz.getByRole('button', { name: /Next question|See results/ }).click();
    }
    const pct = Math.round(((golden.questions.length - 1) / golden.questions.length) * 100);
    await expect(quiz.getByRole('img', { name: `Score ${pct}%` })).toBeVisible();

    await quiz.getByRole('button', { name: 'Review mistakes (1)' }).click();
    await expect(quiz.locator('[data-question]')).toHaveCount(1);
    await expect(quiz.locator(`[data-question="${first.id}"]`)).toBeVisible();

    await quiz.getByRole('button', { name: 'Retry quiz' }).click();
    await expect(quiz).toContainText('Question 1');
    await expect(quiz.getByRole('button', { name: 'Check' })).toBeVisible();
  });
});

test.describe('flashcard review', () => {
  // Content-independent: a session introduces at most 10 new cards (DEFAULT_NEW_PER_SESSION).
  test('reviews a session of new cards, repeats "again" cards, then counts down the new pool', async ({ page }) => {
    await page.goto('/review/?module=theory');
    const review = page.locator('[data-review][data-ready="true"]');
    await expect(review).toContainText('10 cards ready');
    const before = Number(/(\d+) new/.exec((await review.textContent()) ?? '')?.[1]);
    expect(before).toBeGreaterThan(10);
    await review.getByRole('button', { name: /Start review/ }).click();

    const counter = page.locator('[data-counter]');
    await expect(counter).toContainText('10 left');
    await page.keyboard.press('Space');
    await expect(page.locator('[data-flipped="true"]')).toBeVisible();
    await page.keyboard.press('1'); // Again: the card stays in the queue
    await expect(counter).toContainText('10 left');
    await expect(counter).toContainText('0 done');

    for (let i = 0; i < 10; i++) {
      await page.getByRole('button', { name: /Show answer/ }).click();
      await page.getByRole('button', { name: /^Good/ }).click();
    }
    await expect(review.getByRole('heading', { name: 'Session complete' })).toBeVisible();
    await expect(review).toContainText('You reviewed 10 cards and repeated 1 you forgot');

    await page.reload();
    await expect(page.locator('[data-review][data-ready="true"]')).toContainText(`${before - 10} new`);
  });

  test('filters by ?module=', async ({ page }) => {
    await page.goto('/review/?module=theory');
    const review = page.locator('[data-review][data-ready="true"]');
    await expect(review).toContainText('Networking for Games');
    await review.getByRole('link', { name: /Select all modules/ }).click();
    await expect(page).not.toHaveURL(/module=/);
    await expect(review).toContainText('All modules');
  });
});

test.describe('flashcard deck', () => {
  test('flips with Space and navigates with arrows', async ({ page }) => {
    await page.goto('/modules/theory/');
    const deck = page.locator('[data-deck]');
    await deck.scrollIntoViewIfNeeded();
    await expect(deck).toHaveAttribute('data-ready', 'true');
    await deck.getByRole('button', { name: 'Show answer' }).click();
    await expect(deck.locator('[data-flipped="true"]')).toBeVisible();
    await deck.focus();
    await page.keyboard.press('ArrowRight');
    await expect(deck).toContainText('Card 2');
    await expect(deck.locator('[data-flipped="false"]')).toBeVisible();
    await page.keyboard.press('Space');
    await expect(deck.locator('[data-flipped="true"]')).toBeVisible();
  });
});

test.describe('certificate and progress', () => {
  const passed = {
    version: 1,
    lessons: { 'theory/packets-and-protocols': { completedAt: '2026-01-02T10:00:00.000Z', quizBest: 100, quizAttempts: 1 } },
    exams: { theory: { bestPct: 93, attempts: 1, passedAt: '2026-01-03T10:00:00.000Z' } },
    srs: {},
    updatedAt: '2026-01-03T10:00:00.000Z',
  };

  test('certificate is locked until the exam is passed', async ({ page }) => {
    await page.goto('/certificate/theory/');
    await expect(page.locator('[data-certificate="locked"]')).toContainText('Certificate locked');
    await expect(page.getByRole('link', { name: /Take the exam/ })).toHaveAttribute('href', /\/modules\/theory\/exam\/?$/);
  });

  test('passed certificate shows the saved name and score', async ({ page }) => {
    await page.addInitScript((p) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('netlearn-progress', p);
        sessionStorage.setItem('seeded', '1');
      }
    }, JSON.stringify(passed));
    await page.goto('/certificate/theory/');
    const cert = page.locator('[data-certificate="unlocked"]');
    await cert.getByLabel('Name on the certificate').fill('Grace Hopper');
    await expect(cert.locator('.cert')).toContainText('Grace Hopper');
    await expect(cert.locator('.cert')).toContainText('93%');
    await expect(cert.getByRole('button', { name: 'Print / Save as PDF' })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Name on the certificate')).toHaveValue('Grace Hopper');
  });

  test('progress export, import validation and two-step reset', async ({ page }) => {
    await page.addInitScript((p) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('netlearn-progress', p);
        sessionStorage.setItem('seeded', '1');
      }
    }, JSON.stringify(passed));
    await page.goto('/progress/');
    const pm = page.locator('[data-progress-manager][data-ready="true"]');
    await expect(pm).toContainText('Passed 93%');

    const [download] = await Promise.all([page.waitForEvent('download'), pm.getByRole('button', { name: 'Export progress' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^netlearn-progress-\d{4}-\d{2}-\d{2}\.json$/);

    const input = pm.locator('[data-import-input]');
    await input.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{nope') });
    await expect(pm.locator('[data-status="error"]')).toContainText("isn't valid JSON");
    await input.setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from('{"version": 99}') });
    await expect(pm.locator('[data-status="error"]')).toContainText('Unsupported progress version');

    await pm.getByRole('button', { name: 'Reset progress…' }).click();
    await pm.getByRole('button', { name: 'Cancel' }).click();
    await expect(pm).toContainText('Passed 93%');
    await pm.getByRole('button', { name: 'Reset progress…' }).click();
    await pm.getByRole('button', { name: 'Yes, delete everything' }).click();
    await expect(pm.locator('[data-status="ok"]')).toContainText('deleted');
    await expect(pm).not.toContainText('Passed 93%');

    const exported = JSON.stringify(passed);
    await input.setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
    await pm.getByRole('button', { name: 'Replace and import' }).click();
    await expect(pm).toContainText('Passed 93%');
  });
});

test.describe('module exam (fixture)', () => {
  // Exams have no content yet, so this runs against a test-only fixture route that exists only when
  // the site is built with NETLEARN_FIXTURES=1 (see src/lib/quiz/fixtures.ts).
  // TODO: once a real exam exists in src/content/exams, point this at it and drop the fixture gate.
  test('draw, navigate, review, submit and unlock', async ({ page }) => {
    const res = await page.goto('/modules/__fixture/exam/');
    test.skip(res?.status() === 404, 'Fixture route not built: run `NETLEARN_FIXTURES=1 pnpm build` to include it.');

    const fixtureAnswers = Object.fromEntries(fixtureExam.questions.map((q) => [q.id, q as unknown as Q]));
    const exam = page.locator('[data-exam][data-ready="true"]');
    await expect(exam).toContainText('drawn from 5');
    await exam.getByRole('button', { name: /Start the exam/ }).click();
    await expect(exam.getByRole('timer')).toBeVisible();

    for (let i = 0; i < 4; i++) {
      const scope = exam.locator('[data-question]');
      const id = await scope.getAttribute('data-question');
      await answer(scope, fixtureAnswers[id!]);
      if (i === 0) {
        // Go forward and back: the answer is kept.
        await exam.getByRole('button', { name: /^Next/ }).click();
        await exam.getByRole('button', { name: /Previous/ }).click();
        await expect(exam.locator(`[data-question="${id}"]`)).toBeVisible();
      }
      await exam.getByRole('button', { name: i < 3 ? /^Next/ : 'Review and submit' }).click();
    }
    await expect(exam).toContainText('4 of 4 answered');
    await exam.getByRole('button', { name: 'Submit exam' }).click();

    const results = page.locator('[data-exam][data-phase="results"]');
    await expect(results.getByRole('heading', { name: 'You passed the exam' })).toBeVisible();
    await expect(results.getByRole('link', { name: 'Get your certificate' })).toHaveAttribute('href', /\/certificate\/__fixture\/?$/);
    await expect(results.locator('[data-feedback="correct"]')).toHaveCount(4);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('netlearn-progress')!).exams.__fixture);
    expect(stored.passedAt).toBeTruthy();
    expect(stored.bestPct).toBe(100);
  });
});

test.describe('accessibility', () => {
  const pages: [string, string][] = [
    [LESSON, '[data-quiz][data-ready="true"]'],
    ['/modules/theory/', '[data-deck][data-ready="true"]'],
    ['/review/', '[data-review][data-ready="true"]'],
    ['/progress/', '[data-progress-manager][data-ready="true"]'],
    ['/certificate/theory/', '[data-certificate][data-ready="true"]'],
  ];
  for (const [url, sel] of pages) {
    test(`no axe violations in engine components on ${url}`, async ({ page }) => {
      await page.goto(url);
      // client:visible islands only hydrate once scrolled into view.
      await page.locator(sel.replace('[data-ready="true"]', '')).scrollIntoViewIfNeeded();
      await expect(page.locator(sel)).toBeVisible();
      const results = await new AxeBuilder({ page }).include(sel).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
});
