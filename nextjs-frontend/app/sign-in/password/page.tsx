import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PasswordSignIn from "@/components/PasswordSignIn";
import ThemeToggle from "@/components/ThemeToggle";
import { homePathFor } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";
import styles from "../../page.module.css";

export const metadata: Metadata = { title: "Sign in with a password · Course Support" };

type Search = { email?: string; error?: string };

export default async function PasswordSignInPage({ searchParams }: { searchParams?: Search }) {
  const user = await getSessionUser();
  if (user) redirect(homePathFor(user));

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
          <h1>Sign in with a password</h1>
          <p className={styles.lead}>For when KU ALL will not let you through. No Google or KU ALL needed.</p>
          <PasswordSignIn
            email={searchParams?.email}
            error={searchParams?.error}
          />
        </div>
        <p className={styles.footer}>Kasetsart University course support and activity dashboard</p>
      </main>
    </div>
  );
}
