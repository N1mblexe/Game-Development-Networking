/**
 * Dashboard progressive enhancement (home page only). Complements progress-dom.ts:
 *
 *   <script type="application/json" id="dashboard-data">{ lessons, cardIds, examModules }</script>
 *   [data-continue]            → filled with the next incomplete lesson (course order)
 *   [data-stat="lessons|cards|exams"] [data-stat-value] [data-stat-sub]
 *
 * Without JavaScript the server-rendered defaults ("Start with lesson 1", zeros) stay in place.
 */
import { $progress, isLessonComplete } from '../lib/progress/store';
import { isDue } from '../lib/srs/sm2';
import type { Progress } from '../lib/progress/types';

interface LessonInfo {
  key: string;
  title: string;
  summary: string;
  module: string;
  moduleTitle: string;
  color: string;
  url: string;
  durationMin: number;
  index: number;
  moduleCount: number;
}
interface DashboardData {
  lessons: LessonInfo[];
  cardIds: string[];
  examModules: string[];
  reviewUrl: string;
  progressUrl: string;
}

const raw = document.getElementById('dashboard-data')?.textContent;
const data: DashboardData | null = raw ? JSON.parse(raw) : null;

function setStat(name: string, value: string, sub?: string) {
  const el = document.querySelector<HTMLElement>(`[data-stat="${name}"]`);
  if (!el) return;
  const v = el.querySelector('[data-stat-value]');
  const s = el.querySelector('[data-stat-sub]');
  if (v) v.textContent = value;
  if (s && sub !== undefined) s.textContent = sub;
}

/**
 * "Where you left off": the first incomplete lesson after the most recently completed one (course order),
 * wrapping around to earlier gaps. Falls back to the first incomplete lesson.
 */
function nextLesson(p: Progress, lessons: LessonInfo[]): LessonInfo | undefined {
  let last = -1;
  let lastAt = '';
  lessons.forEach((l, i) => {
    const at = p.lessons[l.key]?.completedAt;
    if (at && at >= lastAt) {
      lastAt = at;
      last = i;
    }
  });
  const ordered = [...lessons.slice(last + 1), ...lessons.slice(0, last + 1)];
  return ordered.find((l) => !isLessonComplete(p, l.key));
}

function renderContinue(p: Progress, d: DashboardData) {
  const card = document.querySelector<HTMLElement>('[data-continue]');
  if (!card || d.lessons.length === 0) return;
  const done = d.lessons.filter((l) => isLessonComplete(p, l.key)).length;
  const next = nextLesson(p, d.lessons);
  const q = <T extends Element = HTMLElement>(sel: string) => card.querySelector<T>(sel);

  card.dataset.state = !next ? 'finished' : done === 0 ? 'start' : 'continue';
  const eyebrow = q('[data-continue-eyebrow]');
  const title = q('[data-continue-title]');
  const meta = q('[data-continue-meta]');
  const summary = q('[data-continue-summary]');
  // The card itself is usually the link (closest() includes the element itself).
  const link = card.closest<HTMLAnchorElement>('[data-continue-link]') ?? q<HTMLAnchorElement>('[data-continue-link]');
  const label = q('[data-continue-label]');

  const pct = Math.round((done / d.lessons.length) * 100);
  const bar = q('[data-continue-bar]');
  if (bar) bar.style.width = `${pct}%`;
  const pctText = q('[data-continue-pct]');
  if (pctText) pctText.textContent = `${pct}% of the course`;

  if (!next) {
    if (eyebrow) eyebrow.textContent = 'All lessons complete';
    if (title) title.textContent = 'You finished every lesson. Nice work.';
    if (meta) meta.textContent = `${done} ${done === 1 ? 'lesson' : 'lessons'} done`;
    if (summary) summary.textContent = 'Keep it fresh with spaced-repetition review, and pass each module exam for a certificate.';
    if (link) link.href = d.reviewUrl;
    if (label) label.textContent = 'Review flashcards';
    card.style.setProperty('--module', 'var(--accent)');
    return;
  }
  if (eyebrow) eyebrow.textContent = done === 0 ? 'Start here' : 'Continue where you left off';
  if (title) title.textContent = next.title;
  if (meta) meta.textContent = `${next.moduleTitle} · lesson ${next.index} of ${next.moduleCount} · ${next.durationMin} min`;
  if (summary) summary.textContent = next.summary;
  if (link) link.href = next.url;
  if (label) label.textContent = done === 0 ? 'Start lesson' : 'Continue';
  card.style.setProperty('--module', next.color);
}

function render(p: Progress) {
  if (!data) return;
  renderContinue(p, data);

  const done = data.lessons.filter((l) => isLessonComplete(p, l.key)).length;
  setStat('lessons', `${done}/${data.lessons.length}`, done === data.lessons.length && done > 0 ? 'all complete' : 'lessons done');

  const seen = data.cardIds.filter((id) => p.srs[id]);
  const due = seen.filter((id) => isDue(p.srs[id])).length;
  const fresh = data.cardIds.length - seen.length;
  setStat('cards', String(due), due === 0 && fresh === 0 ? 'nothing due today' : `due today · ${fresh} new`);

  const passed = data.examModules.filter((m) => p.exams[m]?.passedAt).length;
  setStat(
    'exams',
    data.examModules.length ? `${passed}/${data.examModules.length}` : '0',
    data.examModules.length ? 'exams passed' : 'exams coming soon',
  );
}

$progress.subscribe(render);
