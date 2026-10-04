import { Rule } from "@seametry/ui";
import styles from "./_desk/desk.module.css";

/**
 * Every product page renders on the server per request, so switching tabs
 * waits on that request. This boundary shows at once, inside the shell, so
 * the tab answers immediately instead of appearing to do nothing.
 */
export default function Loading() {
  return (
    <section className={styles.loading} role="status">
      <span>Opening the page</span>
      <Rule label="Waiting for the server" />
    </section>
  );
}
