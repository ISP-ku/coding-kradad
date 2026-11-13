import type { Metadata } from "next";
import { redirect } from "next/navigation";
import EmailSignIn from "@/components/EmailSignIn";
import ThemeToggle from "@/components/ThemeToggle";
import { API_BASE, authOptions } from "@/lib/api";
import { homePathFor } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";
import styles from "../../page.module.css";

export const metadata: Metadata = { title: "Sign in with an email code · Course Support" };

type Search = { email?: string; sent?: string; error?: string };

export default async function EmailSignInPage({ searchParams }: { searchParams?: Search }) {
  const [user, options] = await Promise.all([getSessionUser(), authOptions()]);
  if (user) redirect(homePathFor(user));
  const sent = searchParams?.sent === "1";

  return (
    <div className={styles.layout}>
      <main className={styles.signIn}>
        <div className={styles.top}>
          <a className={styles.brand} href="/">
            <svg className={styles.logo} viewBox="0 0 30 30" aria-hidden="true">
              <rect width="30" height="30" rx="8" />
              <path d="M9 10.5h12M9 15h8M9 19.5h10" />
            </svg>
            Course Support
          </a>
          <ThemeToggle />
        </div>
        <div className={styles.card}>
          <h1>{sent ? "Check your email" : "Sign in with an email code"}</h1>
          <p className={styles.lead}>
            {sent
              ? "Type the code from the email to finish signing in."
              : "No Google or KU ALL needed. We email you a code, you type it in."}
          </p>
          <EmailSignIn
            apiBase={API_BASE}
            email={searchParams?.email}
            sent={sent}
            error={searchParams?.error}
            allowPersonal={options.personal_google}
          />
        </div>
        <p className={styles.footer}>Kasetsart University course support and activity dashboard</p>
      </main>
    </div>
  );
}
