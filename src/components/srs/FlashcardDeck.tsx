import { useState, type KeyboardEvent } from 'react';
import { useHydrated } from '../../lib/progress/react';
import { randomSeed, range, shuffle } from '../../lib/quiz/random';
import FlipCard from './FlipCard';
import type { DeckCard } from './types';

export interface FlashcardDeckProps {
  /** Cards for one module or lesson; browse mode (no scheduling). */
  cards: DeckCard[];
  /** Optional heading-free label for the deck region. */
  label?: string;
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** Browse mode: flip, previous/next, shuffle. Space flips and arrows navigate while the deck has focus. */
export default function FlashcardDeck({ cards, label = 'Flashcards' }: FlashcardDeckProps) {
  const [order, setOrder] = useState(() => range(cards.length));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [shuffled, setShuffled] = useState(false);
  const hydrated = useHydrated();

  if (!cards.length) return <p className="text-muted">No flashcards yet.</p>;
  const card = cards[order[pos]];

  const go = (delta: number) => {
    setPos((p) => (p + delta + cards.length) % cards.length);
    setFlipped(false);
  };
  const toggleShuffle = () => {
    setOrder(shuffled ? range(cards.length) : shuffle(range(cards.length), randomSeed()));
    setShuffled(!shuffled);
    setPos(0);
    setFlipped(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
    const onButton = e.target instanceof HTMLButtonElement;
    if ((e.key === ' ' || e.key === 'Enter') && !onButton) {
      e.preventDefault();
      setFlipped((f) => !f);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    }
  };

  return (
    <section
      className="not-prose mx-auto max-w-2xl rounded-xl focus:outline-none focus-visible:outline-2"
      aria-label={label}
      aria-roledescription="flashcard deck"
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-deck
      data-ready={hydrated ? 'true' : undefined}
    >
      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold tabular-nums" aria-live="polite">
          Card {pos + 1} <span className="font-normal text-muted">of {cards.length}</span>
          <span className="sr-only">{flipped ? ', answer shown' : ''}</span>
        </span>
        <button type="button" className="btn px-3 py-1.5 text-sm" aria-pressed={shuffled} onClick={toggleShuffle}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {shuffled ? 'Shuffled' : 'Shuffle'}
        </button>
      </div>

      <FlipCard key={card.globalId} card={card} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <button type="button" className="btn justify-self-start" onClick={() => go(-1)} aria-label="Previous card">
          <span aria-hidden="true">←</span> <span className="hidden sm:inline">Previous</span>
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setFlipped((f) => !f)} aria-pressed={flipped}>
          {flipped ? 'Show question' : 'Show answer'}
        </button>
        <button type="button" className="btn justify-self-end" onClick={() => go(1)} aria-label="Next card">
          <span className="hidden sm:inline">Next</span> <span aria-hidden="true">→</span>
        </button>
      </div>
      <p className="mt-3 hidden text-center text-xs text-muted sm:block">
        <kbd className="rounded border border-border bg-surface-2 px-1.5 font-mono">Space</kbd> flip ·{' '}
        <kbd className="rounded border border-border bg-surface-2 px-1.5 font-mono">←</kbd>{' '}
        <kbd className="rounded border border-border bg-surface-2 px-1.5 font-mono">→</kbd> navigate
      </p>
    </section>
  );
}
