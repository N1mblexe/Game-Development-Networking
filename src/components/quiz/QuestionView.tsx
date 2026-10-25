import type { ComponentType, ReactNode, Ref } from 'react';
import type { Question, QuestionType } from '../../lib/content/schemas';
import type { QuizResponse } from '../../lib/quiz/grade';
import { renderInline } from '../../lib/quiz/inline';
import CodeBlock from './CodeBlock';
import CodeLineQuestion from './questions/CodeLineQuestion';
import FillQuestion from './questions/FillQuestion';
import MultiQuestion from './questions/MultiQuestion';
import NumericQuestion from './questions/NumericQuestion';
import OrderQuestion from './questions/OrderQuestion';
import SingleQuestion from './questions/SingleQuestion';
import TrueFalseQuestion from './questions/TrueFalseQuestion';
import type { QuestionInputProps } from './questions/shared';

const RENDERERS: { [T in QuestionType]: ComponentType<QuestionInputProps<T>> } = {
  single: SingleQuestion,
  multi: MultiQuestion,
  truefalse: TrueFalseQuestion,
  order: OrderQuestion,
  codeline: CodeLineQuestion,
  fill: FillQuestion,
  numeric: NumericQuestion,
};

export const TYPE_LABEL: Record<QuestionType, string> = {
  single: 'Single choice',
  multi: 'Multiple choice',
  truefalse: 'True or false',
  order: 'Put in order',
  codeline: 'Find the line',
  fill: 'Fill in',
  numeric: 'Number',
};

export interface QuestionViewProps {
  question: Question;
  value: QuizResponse;
  onChange?: (value: QuizResponse) => void;
  /** Read-only inputs. */
  locked?: boolean;
  /** Show right/wrong marks. Implies nothing about `locked`. */
  reveal?: boolean;
  /** Option display order for single/multi (see lib/quiz optionOrder). */
  order?: number[];
  /** Unique prefix for ids and input names; required when several questions share a page. */
  idPrefix: string;
  /** Small text above the prompt, e.g. "Question 2 of 6". Also read as part of the legend. */
  eyebrow?: ReactNode;
  /** Enter in a field triggers this (Check / Next). */
  onSubmit?: () => void;
  /** Receives the focusable wrapper; used to move focus to a new question. */
  focusRef?: Ref<HTMLDivElement>;
}

/** Renders any question type inside a fieldset/legend, with its code (if any) under the prompt. */
export default function QuestionView({
  question,
  value,
  onChange = () => {},
  locked = false,
  reveal = false,
  order = [],
  idPrefix,
  eyebrow,
  onSubmit,
  focusRef,
}: QuestionViewProps) {
  const name = `${idPrefix}-${question.id}`;
  const legendId = `${name}-legend`;
  const Renderer = RENDERERS[question.type] as ComponentType<QuestionInputProps>;
  const showCode = question.code && question.type !== 'codeline';

  return (
    <div ref={focusRef} tabIndex={-1} className="min-w-0 rounded-lg focus:outline-none" data-question={question.id}>
      <fieldset className="min-w-0">
        <legend id={legendId} className="mb-3 w-full">
          {eyebrow && <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">{eyebrow}</span>}
          <span className="block text-lg leading-snug font-semibold [overflow-wrap:anywhere]">{renderInline(question.prompt)}</span>
        </legend>
        {showCode && <CodeBlock code={question.code!} lang={question.lang} className="mb-4" label="Code for this question" />}
        <Renderer
          question={question}
          value={value}
          onChange={onChange}
          locked={locked}
          reveal={reveal}
          name={name}
          order={order}
          labelledBy={legendId}
          onSubmit={onSubmit}
        />
      </fieldset>
    </div>
  );
}
