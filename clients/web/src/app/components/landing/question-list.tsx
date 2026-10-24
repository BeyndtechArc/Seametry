import { QuietLink } from "@seametry/ui";
import { source } from "@/lib/docs/source";
import styles from "./landing.module.css";

// How it works owns these answers. Each question is one of its headings and
// each answer is that section's first paragraph, read from the docs source,
// so the landing can never state an answer the page does not.
const PAGE = "how-it-works";

/** components.md, Question list. */
export function QuestionList() {
  const page = source.getPage([PAGE]);
  if (!page) return null;
  const { headings, contents } = page.data.structuredData;
  const questions = headings
    .map((heading) => ({ heading, answer: contents.find((content) => content.heading === heading.id)?.content }))
    .filter((question): question is { heading: (typeof headings)[number]; answer: string } => Boolean(question.answer));

  return (
    <ul className={styles.questions}>
      {questions.map(({ heading, answer }, index) => (
        <li key={heading.id}>
          <details>
            <summary>
              <span className={styles.questionIndex}>{String(index + 1).padStart(2, "0")}</span>
              <span>{heading.content}</span>
              <span className={styles.toggle} aria-hidden="true" />
            </summary>
            <div>
              <p>{answer}</p>
              <QuietLink href={`${page.url}#${heading.id}`} icon="arrow-up-right">Read the full answer</QuietLink>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
