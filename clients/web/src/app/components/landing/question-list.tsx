import { QuietLink } from "@seametry/ui";
import { source } from "@/lib/docs/source";
import styles from "./landing.module.css";

// How it works owns these answers. The landing asks four of its questions,
// the ones a buyer asks before holding a share, each in a few words of its
// own (Storm, 24 October 2026: the page's headings ran too long to scan).
// The answer is the opening of that section, read from the docs source, so
// the landing can never state an answer the page does not. A question whose
// section the page no longer has is dropped rather than answered from
// memory.
const PAGE = "how-it-works";
const ASKED = [
  { id: "why-is-a-bundle-of-tokens-not-an-etf", ask: "Why is a bundle not an ETF?" },
  { id: "what-can-the-issuer-still-do-to-my-token", ask: "What can an issuer still do?" },
  { id: "what-happens-when-i-melt-and-what-if-an-issuer-freezes-one-constituent", ask: "What if an issuer freezes a leg?" },
  { id: "who-is-allowed-to-strike-and-melt", ask: "Who can Strike and Melt?" },
];
/** An answer is the section's opening, up to two paragraphs, stopping before one that introduces a figure. */
const OPENING = 2;

/** components.md, Question list. */
export function QuestionList() {
  const page = source.getPage([PAGE]);
  if (!page) return null;
  const { headings, contents } = page.data.structuredData;

  const questions = ASKED.flatMap(({ id, ask }) => {
    if (!headings.some((heading) => heading.id === id)) return [];
    const answer: string[] = [];
    for (const content of contents.filter((candidate) => candidate.heading === id)) {
      if (answer.length === OPENING || content.content.trim().endsWith(":")) break;
      answer.push(content.content);
    }
    return answer.length ? [{ id, ask, answer }] : [];
  });

  return (
    <ul className={styles.questions}>
      {questions.map(({ id, ask, answer }, index) => (
        <li key={id}>
          <details>
            <summary>
              <span className={styles.questionIndex}>{String(index + 1).padStart(2, "0")}</span>
              <span>{ask}</span>
              <span className={styles.toggle} aria-hidden="true" />
            </summary>
            <div>
              {answer.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              <QuietLink href={`${page.url}#${id}`} icon="arrow-up-right">Read the full answer</QuietLink>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
