import type { Metadata } from "next";
import Link from "next/link";
import { API_BASE, localTestLoginAvailable, loginUrl, logoutUrl } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Sign in · Course Support" };

export default async function LoginPage() {
  const user = await getSessionUser();
  const localTesting = await localTestLoginAvailable();

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
              <a className={styles.secondary} href={logoutUrl}>
                Log out and use another account
              </a>
            </>
          ) : (
            <>
              <h2>Welcome back.</h2>
              <p className={styles.description}>Sign in with your KU email to open your course dashboard.</p>
              <a className={styles.loginBtn} href={loginUrl("google")}>
                <span className={`${styles.providerSymbol} ${styles.google}`} aria-hidden="true">G</span>
                Sign in with KU Google
              </a>
              {localTesting && (
                <a className={styles.loginBtn} href={`${API_BASE}/local-test-login`}>
                  Local test login (no Google)
                </a>
              )}
            </>
          )}
          <p className={styles.loginHelp}>Use your university Google account ending in @ku.th.</p>
        </div>
      </section>
    </main>
  );
}
