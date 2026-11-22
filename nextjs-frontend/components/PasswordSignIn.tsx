import kit from "./form/FormKit.module.css";
import styles from "./PasswordSignIn.module.css";

type Props = {
  email?: string;
  error?: string;
};

const MESSAGES: Record<string, string> = {
  wrong: "That email and password do not match. Check both and try again.",
  locked: "Too many wrong tries. Wait 15 minutes, or ask your lecturer for a new password.",
  denied: "This account is not registered in any course. Ask a lecturer to add you.",
};

/** What to tell the person after a failed try; empty when there was none. */
function errorText(error: string | undefined): string {
  if (!error) return "";
  if (error === "invalid_email") return "Enter the email address your lecturer added.";
  return MESSAGES[error] ?? "Something went wrong. Please try again.";
}

/**
 * Sign in with a password a lecturer created on the Access page, for people
 * KU ALL will not let through. A plain HTML form that posts to /password-login
 * (passed on to the backend), so it works without JavaScript and the backend
 * sets the session cookie on this site.
 */
export default function PasswordSignIn({ email = "", error }: Props) {
  const message = errorText(error);

  return (
    <div className={styles.wrap}>
      {message && <div className={kit.formError} role="alert">{message}</div>}
      <form className={kit.card} action="/password-login" method="post" aria-label="Sign in with a password">
        <div className={kit.field}>
          <div className={kit.labelRow}><label htmlFor="signin-email">Email address</label></div>
          <p className={kit.hint} id="signin-email-hint">
            The email address your lecturer added.
          </p>
          <input id="signin-email" name="email" type="email" required autoComplete="username" defaultValue={email}
            autoFocus={!email} placeholder="name.s@ku.th" aria-describedby="signin-email-hint"
            aria-invalid={error === "invalid_email" ? true : undefined} />
        </div>
        <div className={kit.field}>
          <div className={kit.labelRow}><label htmlFor="signin-password">Password</label></div>
          <p className={kit.hint} id="signin-password-hint">The password your lecturer gave you.</p>
          <input id="signin-password" name="password" type="password" required autoComplete="current-password"
            autoFocus={!!email} aria-describedby="signin-password-hint"
            aria-invalid={error === "wrong" ? true : undefined} />
        </div>
        <div className={kit.actions}>
          <button type="submit" className={kit.submit}>Sign in</button>
          <a className={kit.cancel} href="/">Back to sign in</a>
        </div>
      </form>
      <p className={styles.more}>No password yet? Ask your lecturer to create one for you on the Access page.</p>
    </div>
  );
}
