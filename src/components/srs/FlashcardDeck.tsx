import type { DeckCard } from './types';

export interface FlashcardDeckProps {
  /** Cards for one module or lesson; browse mode (no scheduling). */
  cards: DeckCard[];
}

/** Phase 0 stub. Agent A implements a browsable flip-card deck. */
export default function FlashcardDeck({ cards }: FlashcardDeckProps) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
      Flashcard deck coming soon ({cards.length} cards).
    </div>
  );
}
