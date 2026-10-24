import type { Flashcard } from '../../lib/content/schemas';

/** A flashcard as passed to islands: the content plus its module and global id. */
export interface DeckCard extends Flashcard {
  module: string;
  /** "<module>/<card-id>": the key used in Progress.srs. */
  globalId: string;
}
