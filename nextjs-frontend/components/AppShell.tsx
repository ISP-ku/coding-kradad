"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { canAccess } from "@/lib/permissions";
import type { SessionUser } from "@/lib/types";
import Icon, { type IconName } from "./Icon";
import ThemeToggle from "./ThemeToggle";
import styles from "./AppShell.module.css";

type Page = "dashboard" | "faq" | "homework" | "consultations" | "reports" | "access";

type Props = {
  page: Page;
  /** Kept for callers; the page name already shows in the menu. */
  title?: string;
  heading: string;
  subtitle: string;
  viewer: SessionUser | null;
  logoutHref: string;
  /** Optional controls shown beside the heading (e.g. "Add activity"). */
  actions?: React.ReactNode;
  children: React.ReactNode;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ROLE_LABEL: Record<string, string> = { ta: "Teaching assistant", lecturer: "Lecturer", student: "Student" };
export const roleLabel = (role?: string) => (role ? ROLE_LABEL[role] : undefined);

export default function AppShell({ page, heading, subtitle, viewer, logoutHref, actions, children }: Props) {
  const [navOpen, setNavOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [today, setToday] = useState<{ iso: string; text: string } | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Today's date, client-only so server and client markup match.
  useEffect(() => {
    const now = new Date();
    setToday({
      iso: now.toLocaleDateString("en-CA"),
      text: new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(now),
    });
  }, []);

  // Track the phone breakpoint; close the drawer when it changes.
  useEffect(() => {
    const mq = window.matchMedia("(max-width:860px)");
    setNarrow(mq.matches);
    const onChange = () => {
      setNarrow(mq.matches);
      setNavOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Hide the closed drawer from keyboard and screen readers on phones.
  useEffect(() => {
    const el = navRef.current as (HTMLElement & { inert: boolean }) | null;
    if (el) el.inert = narrow && !navOpen;
  }, [narrow, navOpen]);

  // Escape closes the drawer (the dialog handles its own Escape).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !dialogRef.current?.open) {
        setNavOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const openAccount = () => {
    setNavOpen(false);
    dialogRef.current?.showModal();
    document.body.style.overflow = "hidden";
  };

  const onDialogClose = () => {
    document.body.style.overflow = "";
    (narrow ? toggleRef.current : triggerRef.current)?.focus();
  };

  const onDialogClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    if (!dialog || e.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) dialog.close();
  };

  const navLink = (href: string, key: Page, icon: IconName, label: string) => (
    <Link href={href} className={page === key ? styles.active : undefined} aria-current={page === key ? "page" : undefined}>
      <Icon name={icon} />
      {label}
    </Link>
  );

  const brand = (
    <span className={styles.brand}>
      <svg className={styles.logo} viewBox="0 0 30 30" aria-hidden="true">
        <rect width="30" height="30" rx="8" />
        <path d="M9 10.5h12M9 15h8M9 19.5h10" />
      </svg>
      Course Support
    </span>
  );

  return (
    <div className={navOpen ? `${styles.shell} ${styles.navOpen}` : styles.shell}>
      <a className={styles.skipLink} href="#main">Skip to content</a>

      <header className={styles.topbar}>
        <button
          type="button"
          className={styles.menuToggle}
          aria-label={navOpen ? "Close navigation" : "Open navigation"}
          aria-controls="navigation"
          aria-expanded={navOpen}
          ref={toggleRef}
          onClick={() => setNavOpen((o) => !o)}
        >
          <Icon name="menu" />
        </button>
        {brand}
      </header>

      <aside className={styles.sidebar} id="navigation" aria-label="Main navigation" ref={navRef}>
        <div className={styles.sideBrand}>{brand}</div>
        <nav className={styles.nav}>
          {/* Students have no dashboard (R-02); signed-out visitors see it as the sign-in entry. */}
          {(!viewer || canAccess(viewer, "dashboard")) && navLink(viewer ? "/dashboard" : "/", "dashboard", "grid", "Dashboard")}
          {canAccess(viewer, "homework") && navLink("/homework", "homework", "book", "Homework")}
          {(!viewer || canAccess(viewer, "consultations")) && navLink("/consultations", "consultations", "clock", "Consultation log")}
          {navLink("/faq", "faq", "chat", "FAQ")}
          {canAccess(viewer, "reports") && navLink("/reports", "reports", "chart", "Reports")}
          {canAccess(viewer, "access") && navLink("/access", "access", "key", "Access")}
        </nav>

        <div className={styles.sideFooter}>
          {viewer ? (
            <>
              <button
                className={styles.person}
                type="button"
                aria-haspopup="dialog"
                aria-controls="account-dialog"
                aria-label={`My account: ${viewer.username}`}
                ref={triggerRef}
                onClick={openAccount}
              >
                <span className={styles.avatar}>
                  {viewer.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={viewer.avatar_url} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <Icon name="user" />
                  )}
                </span>
                <span className={styles.personText}>
                  <strong>{viewer.username}</strong>
                  <small>{roleLabel(viewer.role) ?? "Signed in"}</small>
                </span>
              </button>
              <ThemeToggle />
              <a className={styles.logout} href={logoutHref}>
                <Icon name="power" />
                Log out
              </a>
            </>
          ) : (
            <>
              <p className={styles.signedOut}>Sign in to continue</p>
              <ThemeToggle />
              <Link className={styles.logout} href="/">
                <Icon name="user" />
                Sign in
              </Link>
            </>
          )}
        </div>
      </aside>

      <button
        className={styles.scrim}
        type="button"
        aria-label="Close navigation"
        tabIndex={-1}
        onClick={() => {
          setNavOpen(false);
          toggleRef.current?.focus();
        }}
      />

      <div className={styles.workspace}>
        <header className={styles.pageHead}>
          <div className={styles.headText}>
            <h1>{heading}</h1>
            <p>{subtitle}</p>
          </div>
          <div className={styles.headSide}>
            <time className={styles.date} dateTime={today?.iso}>{today?.text}</time>
            {actions}
          </div>
        </header>
        <main className={styles.content} id="main">
          {children}
        </main>
      </div>

      {viewer && (
        <dialog
          id="account-dialog"
          className={styles.accountDialog}
          aria-labelledby="account-title"
          aria-describedby="account-description"
          ref={dialogRef}
          onClose={onDialogClose}
          onClick={onDialogClick}
        >
          <header className={styles.accountDialogHeader}>
            <h2 id="account-title">My account</h2>
            <button
              type="button"
              className={styles.closeAccount}
              aria-label="Close account information"
              autoFocus
              onClick={() => dialogRef.current?.close()}
            >
              ×
            </button>
          </header>
          <div className={styles.accountProfile}>
            <span className={styles.avatar}>
              {viewer.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={viewer.avatar_url} alt="Your profile photo" referrerPolicy="no-referrer" />
              ) : (
                <Icon name="user" />
              )}
            </span>
            <div>
              <h3>{viewer.username || "Student"}</h3>
              <p id="account-description">
                {roleLabel(viewer.role) ?? "Signed in"} with a {viewer.provider === "local" ? "local test" : cap(viewer.provider)} account
              </p>
            </div>
          </div>
          <dl className={styles.accountDetails}>
            <div><dt>Display name</dt><dd>{viewer.username || "Not provided"}</dd></div>
            <div><dt>Student ID</dt><dd>{viewer.student_id || "Not provided"}</dd></div>
            <div><dt>Email address</dt><dd>{viewer.email || "Not provided"}</dd></div>
            <div><dt>Sign-in provider</dt><dd>{viewer.provider ? cap(viewer.provider) : "Not provided"}</dd></div>
            <div><dt>Provider account ID</dt><dd>{viewer.id || "Not provided"}</dd></div>
            {viewer.classroom_courses && viewer.classroom_courses.length > 0 && (
              <div>
                <dt>Google Classroom courses</dt>
                <dd><ul>{viewer.classroom_courses.map((c) => <li key={c.name}>{c.name}</li>)}</ul></dd>
              </div>
            )}
          </dl>
          <p className={styles.accountFootnote}>
            Your provider account ID is different from your university student ID.
          </p>
          <footer className={styles.accountDialogFooter}>
            <a href={logoutHref}>Log out</a>
            <button type="button" className={styles.doneAccount} onClick={() => dialogRef.current?.close()}>Done</button>
          </footer>
        </dialog>
      )}
    </div>
  );
}
