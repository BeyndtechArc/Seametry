import { source } from "@/lib/docs/source";
import { QuestionTabs, type Question } from "./question-tabs";

// How it works owns these answers. The landing asks four of its questions,
// the ones a buyer asks before holding a share (Storm, 24 October 2026:
// fewer questions, each well answered), and answers each with the opening
// of that section, read from the docs source, so the landing can never
// state an answer the page does not. A question the page no longer asks is
// dropped rather than answered from memory.
const PAGE = "how-it-works";
const ASKED = [
  "why-is-a-bundle-of-tokens-not-an-etf",
  "what-can-the-issuer-still-do-to-my-token",
  "what-happens-when-i-melt-and-what-if-an-issuer-freezes-one-constituent",
  "who-is-allowed-to-strike-and-melt",
];
/** An answer is the section's opening, up to two paragraphs, stopping before one that introduces a figure. */
const OPENING = 2;

/** components.md, Question list. */
export function QuestionList() {
  const page = source.getPage([PAGE]);
  if (!page) return null;
  const { headings, contents } = page.data.structuredData;

  const questions: Question[] = [];
  for (const id of ASKED) {
    const heading = headings.find((candidate) => candidate.id === id);
    if (!heading) continue;
    const answer: string[] = [];
    for (const content of contents.filter((candidate) => candidate.heading === id)) {
      if (answer.length === OPENING || content.content.trim().endsWith(":")) break;
      answer.push(content.content);
    }
    if (answer.length) questions.push({ id, question: heading.content, answer, href: `${page.url}#${id}` });
  }
  return questions.length ? <QuestionTabs questions={questions} /> : null;
}
