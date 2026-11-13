import kit from "./form/FormKit.module.css";
import styles from "./EmailSignIn.module.css";

type Props = {
  /** Backend address the forms post to (the session cookie is set there). */
  apiBase: string;
  email?: string;
  /** True once a code has been asked for: shows the code step. */
  sent?: boolean;
  error?: string;
  /** Personal Gmail accounts are turned on (ALLOW_PERSONAL_GOOGLE). */
  allowPersonal?: boolean;
};

const MESSAGES: Record<string, string> = {
  wrong: "That code is not right. Check the email and try again.",
  expired: "This code has expired or was already used. Send a new one.",
  locked: "Too many wrong tries. Send a new code.",
  wait: "A code was sent a moment ago. Wait a minute before asking for another.",
  denied: "This account is not registered in any course. Ask a lecturer to add you.",
  send_failed: "The email could not be sent. Please try again in a moment.",
  unavailable: "Email sign-in is not set up on this server yet. Use KU Google sign-in, or ask the course team.",
};

/**
 * Sign in with a one-time code sent by email, without Google or KU ALL.
 * Plain HTML forms that post to the backend, so they work without JavaScript
 * and the backend sets the session cookie itself.
 */
export default function EmailSignIn({ apiBase, email = "", sent = false, error, allowPersonal = false }: Props) {
  const message = error === "invalid_email"
    ? allowPersonal
      ? "Enter your KU email address ending in @ku.th, or the Gmail address your lecturer added."
      : "Enter your KU email address, ending in @ku.th."
    : error ? MESSAGES[error] ?? "Something went wrong. Please try again." : "";

  if (!sent) {
    return (
      <div className={styles.wrap}>
        {message && <div className={kit.formError} role="alert">{message}</div>}
        <form className={kit.card} action={`${apiBase}/email-login/request`} method="post" aria-label="Get a sign-in code">
          <div className={kit.field}>
            <div className={kit.labelRow}><label htmlFor="signin-email">Email address</label></div>
            <p className={kit.hint} id="signin-email-hint">
              {allowPersonal ? "Your @ku.th address, or the Gmail address your lecturer added." : "Your KU address, ending in @ku.th."}
            </p>
            <input id="signin-email" name="email" type="email" required autoComplete="email" defaultValue={email}
              placeholder="name.s@ku.th" aria-describedby="signin-email-hint" aria-invalid={error === "invalid_email" ? true : undefined} />
          </div>
          <div className={kit.actions}>
            <button type="submit" className={kit.submit}>Email me a code</button>
            <a className={kit.cancel} href="/">Back to sign in</a>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={kit.formNotice} role="status">
        If {email} can sign in, we&apos;ve sent a 6-digit code to it. It works once and expires in 10 minutes.
      </div>
      {message && <div className={kit.formError} role="alert">{message}</div>}
      <form className={kit.card} action={`${apiBase}/email-login/verify`} method="post" aria-label="Enter your code">
        <input type="hidden" name="email" value={email} />
        <div className={kit.field}>
          <div className={kit.labelRow}><label htmlFor="signin-code">6-digit code</label></div>
          <p className={kit.hint} id="signin-code-hint">Check your inbox, and your spam folder if it is not there.</p>
          <input id="signin-code" name="code" className={styles.code} required inputMode="numeric" pattern="[0-9]{6}"
            maxLength={6} autoComplete="one-time-code" autoFocus placeholder="000000"
            aria-describedby="signin-code-hint" aria-invalid={error === "wrong" ? true : undefined} />
        </div>
        <div className={kit.actions}>
          <button type="submit" className={kit.submit}>Sign in</button>
        </div>
      </form>
      <div className={styles.more}>
        <form action={`${apiBase}/email-login/request`} method="post" aria-label="Send a new code">
          <input type="hidden" name="email" value={email} />
          <button type="submit" className={styles.linkButton}>Send a new code</button>
        </form>
        <a href="/sign-in/email">Use a different email</a>
      </div>
    </div>
  );
}
