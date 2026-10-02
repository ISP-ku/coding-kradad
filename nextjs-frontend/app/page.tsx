import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import styles from "./page.module.css";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:8000";

export default async function LoginPage() {
  const user = await getSessionUser();

  return (
    <main className={styles.loginLayout}>
      <section className={styles.intro} aria-label="About Course Support">
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M12 6v15M3 3c4 0 6 1 9 3 3-2 5-3 9-3v15c-4 0-6 1-9 3-3-2-5-3-9-3z" />
            </svg>
          </span>
          Course Support
        </div>
        <div className={styles.story}>
          <p className={styles.eyebrow}>YOUR STUDENT WORKSPACE</p>
          <h1>
            A clearer space
            <br />
            for <span>learning.</span>
          </h1>
          <p>
            Connect with your courses and teaching team. Start with the account
            you already use.
          </p>
          <div className={styles.illustration} aria-hidden="true">
            <div className={styles.illustrationTop}>
              <span className={styles.miniLabel} />
              <span className={styles.miniDots}>
                <i /><i /><i />
              </span>
            </div>
            {[0, 1, 2].map((n) => (
              <div className={styles.miniRow} key={n}>
                <span className={styles.miniCheck}>✓</span>
                <span className={styles.miniLines}>
                  <i /><i />
                </span>
                <span className={styles.miniPill} />
              </div>
            ))}
          </div>
        </div>
        <div className={styles.introFooter}>Course Support &amp; Activity Dashboard</div>
      </section>

      <section className={styles.signIn} aria-label="Account access">
        <div className={styles.loginCard}>
          <span className={styles.portalLabel}>Student portal</span>
          {user ? (
            <>
              {user.avatar_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.avatar} src={user.avatar_url} alt="Your profile photo" referrerPolicy="no-referrer" />
              )}
              <h2>
                Welcome back,
                <br />
                {user.username}
              </h2>
              <p className={styles.description}>
                You&apos;re signed in with{" "}
                {user.provider[0].toUpperCase() + user.provider.slice(1)}. Your
                workspace is ready.
              </p>
              <Link className={`${styles.loginBtn} ${styles.primary}`} href="/dashboard">
                Go to Dashboard <span aria-hidden="true">→</span>
              </Link>
              <a className={styles.secondary} href={`${API_BASE}/logout`}>
                Log out and use another account
              </a>
            </>
          ) : (
            <>
              <h2>Welcome back.</h2>
              <p className={styles.description}>Sign in to open your course dashboard.</p>
              <a className={styles.loginBtn} href={`${API_BASE}/login/google`}>
                <span className={`${styles.providerSymbol} ${styles.google}`} aria-hidden="true">G</span>
                Login with Google (Classroom)
              </a>
              <div className={styles.divider}>or continue with</div>
              <a className={styles.loginBtn} href={`${API_BASE}/login/discord`}>
                <span className={`${styles.providerSymbol} ${styles.discord}`} aria-hidden="true">D</span>
                Login with Discord
              </a>
              <a className={styles.loginBtn} href={`${API_BASE}/login/line`}>
                <span className={`${styles.providerSymbol} ${styles.line}`} aria-hidden="true">LINE</span>
                Login with LINE
              </a>
            </>
          )}
          <p className={styles.loginHelp}>Use the account you normally use for your courses.</p>
        </div>
      </section>
    </main>
  );
}
