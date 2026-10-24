"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { QuietLink } from "@seametry/ui";
import styles from "./landing.module.css";

export type Question = { id: string; question: string; answer: string[]; href: string };

/**
 * components.md, Question list: the questions down one side, the open
 * answer large beside them. Each question is a link to its section of How
 * it works, so without script it still leads to its answer; with script it
 * opens the answer here instead.
 */
export function QuestionTabs({ questions }: { questions: Question[] }) {
  const [open, setOpen] = useState(0);
  const tabs = useRef<(HTMLAnchorElement | null)[]>([]);
  const current = questions[open];

  const move = (event: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + questions.length) % questions.length;
    setOpen(next);
    tabs.current[next]?.focus();
  };

  return (
    <div className={styles.ask}>
      <div className={styles.askList} role="tablist" aria-orientation="vertical" aria-label="Questions">
        {questions.map((question, index) => (
          <a
            key={question.id}
            ref={(node) => { tabs.current[index] = node; }}
            href={question.href}
            role="tab"
            id={`ask-${question.id}`}
            aria-selected={index === open}
            aria-controls="ask-answer"
            tabIndex={index === open ? 0 : -1}
            onClick={(event) => { event.preventDefault(); setOpen(index); }}
            onKeyDown={(event) => move(event, index)}
          >
            <span className={styles.questionIndex}>{String(index + 1).padStart(2, "0")}</span>
            <span>{question.question}</span>
          </a>
        ))}
      </div>
      <div className={styles.askAnswer} role="tabpanel" id="ask-answer" aria-labelledby={`ask-${current.id}`}>
        {current.answer.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        <QuietLink href={current.href} icon="arrow-up-right">Read the full answer</QuietLink>
      </div>
    </div>
  );
}
