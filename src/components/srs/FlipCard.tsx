import type { ReactNode } from 'react';
import { renderInline } from '../../lib/quiz/inline';
import CodeBlock from '../quiz/CodeBlock';
import type { DeckCard } from './types';

interface Props {
  card: DeckCard;
  flipped: boolean;
  onFlip: () => void;
  /** Small label in the top corner, e.g. the module name. */
  tag?: ReactNode;
}

const face =
  'card flex min-h-60 flex-col p-5 [grid-area:1/1] [backface-visibility:hidden] sm:min-h-64 sm:p-7 [overflow-wrap:anywhere]';

/**
 * Two-sided card. Both faces share one grid cell, so the card is as tall as its longer side.
 * The hidden face is `inert` (out of the tab order and the accessibility tree).
 * The 3D flip is a CSS transition, which the global reduced-motion rule turns into an instant swap.
 */
export default function FlipCard({ card, flipped, onFlip, tag }: Props) {
  return (
    <div className="[perspective:1400px]">
      <div
        className="grid cursor-pointer transition-transform duration-500 ease-out [transform-style:preserve-3d] motion-reduce:transition-none"
        style={{ transform: flipped ? 'rotateY(180deg)' : 'none' }}
        onClick={(e) => {
          // Let people select text or scroll code without flipping.
          if ((e.target as Element).closest('pre') || window.getSelection()?.toString()) return;
          onFlip();
        }}
        data-flipped={flipped}
      >
        <div className={face} inert={flipped} data-face="front">
          <div className="flex items-start justify-between gap-3 text-xs font-semibold uppercase tracking-wider text-muted">
            <span>Question</span>
            {tag}
          </div>
          <div className="grid flex-1 place-items-center py-4">
            <p className="text-center text-xl leading-snug font-semibold sm:text-2xl">{renderInline(card.front)}</p>
          </div>
          <p className="text-center text-xs text-muted">Click or press Space to flip</p>
        </div>
        <div className={`${face} [transform:rotateY(180deg)] border-accent/50`} inert={!flipped} data-face="back">
          <div className="flex items-start justify-between gap-3 text-xs font-semibold uppercase tracking-wider text-accent">
            <span>Answer</span>
            {tag}
          </div>
          <p className="mt-3 text-sm text-muted">{renderInline(card.front)}</p>
          <div className="flex flex-1 flex-col justify-center gap-4 py-3">
            <p className="text-lg leading-relaxed">{renderInline(card.back)}</p>
            {card.code && <CodeBlock code={card.code} lang={card.lang} label="Code for this card" />}
          </div>
        </div>
      </div>
    </div>
  );
}
