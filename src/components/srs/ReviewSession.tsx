import type { DeckCard } from './types';

export interface ReviewSessionProps {
  /** Every card in the course; the session picks due + new cards using lib/srs. */
  cards: DeckCard[];
  moduleTitles: Record<string, string>;
  /** Max new (never seen) cards introduced per session. */
  newPerSession?: number;
}

/** Phase 0 stub. Agent A implements the review loop (flip, again/hard/good/easy, setCardState). */
export default function ReviewSession({ cards }: ReviewSessionProps) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
      Flashcard review coming soon ({cards.length} cards).
    </div>
  );
}
