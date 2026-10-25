import { useRef, useState } from 'react';
import { renderInline } from '../../../lib/quiz/inline';
import { Mark, optionClass, type QuestionInputProps } from './shared';

const Arrow = ({ up }: { up: boolean }) => (
  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d={up ? 'M5 12l5-5 5 5' : 'M5 8l5 5 5-5'} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Reorder with up/down buttons (keyboard and screen-reader friendly) or drag and drop (mouse).
 * Focus follows the moved item, and each move is announced.
 */
export default function OrderQuestion({ question: q, value, onChange, locked, reveal, name }: QuestionInputProps<'order'>) {
  const n = q.items.length;
  const arr = Array.isArray(value) && value.length === n ? value : q.items.map((_, i) => i);
  const buttons = useRef(new Map<string, HTMLButtonElement | null>());
  const [announce, setAnnounce] = useState('');
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const move = (from: number, to: number, focusDir?: 'up' | 'down') => {
    if (to < 0 || to >= n || from === to) return;
    const next = arr.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
    setAnnounce(`"${q.items[item]}" moved to position ${to + 1} of ${n}.`);
    if (focusDir) {
      // Keep focus on the same item. If it hit the edge, switch to the other arrow.
      const dir = (focusDir === 'up' && to === 0) || (focusDir === 'down' && to === n - 1) ? (focusDir === 'up' ? 'down' : 'up') : focusDir;
      requestAnimationFrame(() => buttons.current.get(`${item}-${dir}`)?.focus());
    }
  };

  return (
    <>
      <p className="mb-2 text-sm text-muted" id={`${name}-hint`}>
        {locked ? 'Your order:' : 'Use the arrow buttons (or drag) to put the items in order, top to bottom.'}
      </p>
      <ol className="grid gap-2" aria-describedby={`${name}-hint`}>
        {arr.map((item, pos) => {
          const state = reveal ? (item === pos ? 'correct' : 'wrong') : over === pos && dragging !== null ? 'selected' : 'idle';
          const text = q.items[item];
          return (
            <li
              key={item}
              data-item={item}
              className={`${optionClass(state, true)} items-center ${dragging === pos ? 'opacity-50' : ''} ${locked ? '' : 'cursor-grab'}`}
              draggable={!locked}
              onDragStart={(e) => {
                setDragging(pos);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(pos));
              }}
              onDragOver={(e) => {
                if (dragging === null) return;
                e.preventDefault();
                setOver(pos);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging !== null) move(dragging, pos);
                setDragging(null);
                setOver(null);
              }}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-bold text-muted">
                {pos + 1}
              </span>
              <span className="min-w-0 flex-1">{renderInline(text)}</span>
              {reveal && (
                <>
                  {item !== pos && <span className="shrink-0 text-xs text-muted">belongs at {item + 1}</span>}
                  <Mark kind={item === pos ? 'correct' : 'wrong'} />
                </>
              )}
              {!locked && (
                <span className="flex shrink-0 gap-1">
                  {(['up', 'down'] as const).map((dir) => {
                    const to = dir === 'up' ? pos - 1 : pos + 1;
                    return (
                      <button
                        key={dir}
                        type="button"
                        ref={(el) => {
                          buttons.current.set(`${item}-${dir}`, el);
                        }}
                        className="btn h-8 w-8 justify-center p-0"
                        aria-label={`Move "${text}" ${dir}`}
                        disabled={to < 0 || to >= n}
                        onClick={() => move(pos, to, dir)}
                      >
                        <Arrow up={dir === 'up'} />
                      </button>
                    );
                  })}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </>
  );
}
