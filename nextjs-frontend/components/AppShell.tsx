"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/lib/types";
import Icon from "./Icon";
import styles from "./AppShell.module.css";

type Props = {
  page: "dashboard" | "faq" | "homework";
  title: string;
  heading: string;
  subtitle: string;
  viewer: SessionUser | null;
  logoutHref: string;
  children: React.ReactNode;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function AppShell({
  page,
  title,
  heading,
  subtitle,
  viewer,
  logoutHref,
  children,
}: Props) {
  const [navOpen, setNavOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [today, setToday] = useState<{ iso: string; text: string } | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Today's date (client-only, avoids server/client mismatch)
  useEffect(() => {
    const now = new Date();
    setToday({
      iso: now.toLocaleDateString("en-CA"),
      text: new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(now),
    });
  }, []);

  // Track the mobile breakpoint; close the drawer when it changes
  useEffect(() => {
    const mq = window.matchMedia("(max-width:760px)");
    setNarrow(mq.matches);
    const onChange = () => {
      setNarrow(mq.matches);
      setNavOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Hide the closed drawer from keyboard/screen readers on mobile
  useEffect(() => {
    const el = navRef.current as (HTMLElement & { inert: boolean }) | null;
    if (el) el.inert = narrow && !navOpen;
  }, [narrow, navOpen]);

  // Escape closes the drawer (the dialog handles its own Escape)
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
    if (
      e.clientX < box.left ||
      e.clientX > box.right ||
      e.clientY < box.top ||
      e.clientY > box.bottom
    ) {
      dialog.close();
    }
  };

  const navLink = (href: string, key: typeof page, icon: "grid" | "chat" | "book", label: string) => (
    <Link
      href={href}
      className={page === key ? styles.active : undefined}
      aria-current={page === key ? "page" : undefined}
    >
      <Icon name={icon} />
      {label}
    </Link>
  );

  const avatar = viewer?.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={viewer.avatar_url} alt="" referrerPolicy="no-referrer" />
  ) : (
    <Icon name="user" />
  );

  return (
    <div className={navOpen ? `${styles.shell} ${styles.navOpen}` : styles.shell}>
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>

      <aside className={styles.sidebar} id="navigation" aria-label="Main navigation" ref={navRef}>
        <div className={styles.profile}>
          <div className={styles.avatar}>{avatar}</div>
          <div className={styles.profileText}>
            <strong>{viewer ? viewer.username : "Course Support"}</strong>
            <small>{viewer ? `${cap(viewer.provider)} account` : "Student portal"}</small>
          </div>
        </div>
        <nav className={styles.nav}>
          {navLink(viewer ? "/dashboard" : "/", "dashboard", "grid", "Dashboard")}
          {navLink("/faq", "faq", "chat", "FAQ / Issue Log")}
          {navLink("/homework", "homework", "book", "Homework Collector")}
          {viewer ? (
            <button
              className={styles.accountTrigger}
              type="button"
              aria-haspopup="dialog"
              aria-controls="student-account"
              ref={triggerRef}
              onClick={openAccount}
            >
              <Icon name="user" />
              My account
            </button>
          ) : (
            <Link href="/">
              <Icon name="user" />
              Sign in
            </Link>
          )}
        </nav>
        <div className={styles.sidebarFooter}>
          <strong>COURSE SUPPORT</strong>
          <br />
          A little clarity for every day.
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
        <header className={styles.appbar}>
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
          <div className={styles.appbarTitle}>
            Course Support <span className={styles.brandDivider}>/</span> Student workspace
          </div>
          <div className={styles.account}>
            {viewer ? (
              <>
                <span className={styles.accountName}>{viewer.username}</span>
                <span className={styles.divider} />
                <a className={styles.logout} href={logoutHref} aria-label="Log out">
                  <Icon name="power" />
                  <span>Log out</span>
                </a>
              </>
            ) : (
              <span className={styles.accountName}>Student portal</span>
            )}
          </div>
        </header>

        <section className={styles.welcome}>
          <h1>{heading}</h1>
          <div className={styles.welcomeMeta}>
            <time className={styles.date} dateTime={today?.iso}>
              {today?.text}
            </time>
            <span className={styles.pill}>{title}</span>
            <span className={styles.welcomeSubtitle}>{subtitle}</span>
          </div>
        </section>

        <main className={styles.content} id="main">
          {children}
        </main>
      </div>

      {viewer && (
        <dialog
          id="student-account"
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
          <div className={styles.studentProfile}>
            <div className={styles.avatar}>
              {viewer.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={viewer.avatar_url} alt="Your profile photo" referrerPolicy="no-referrer" />
              ) : (
                <Icon name="user" />
              )}
            </div>
            <div>
              <h3>{viewer.username || "Student"}</h3>
              <p id="account-description">Your signed-in account information</p>
            </div>
          </div>
          <dl className={styles.accountDetails}>
            <div>
              <dt>Display name</dt>
              <dd>{viewer.username || "Not provided"}</dd>
            </div>
            <div>
              <dt>Student ID</dt>
              <dd>{viewer.student_id || "Not provided"}</dd>
            </div>
            <div>
              <dt>Email address</dt>
              <dd>{viewer.email || "Not provided"}</dd>
            </div>
            <div>
              <dt>Sign-in provider</dt>
              <dd>{viewer.provider ? cap(viewer.provider) : "Not provided"}</dd>
            </div>
            <div>
              <dt>Provider account ID</dt>
              <dd>{viewer.id || "Not provided"}</dd>
            </div>
            {viewer.classroom_courses && viewer.classroom_courses.length > 0 && (
              <div>
                <dt>Google Classroom courses</dt>
                <dd>
                  <ul>
                    {viewer.classroom_courses.map((c) => (
                      <li key={c.name}>{c.name}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
          </dl>
          <p className={styles.accountFootnote}>
            Information comes from your signed-in account. Your provider account ID is
            different from your university student ID.
          </p>
          <footer className={styles.accountDialogFooter}>
            <a href={logoutHref}>Log out</a>
            <button
              type="button"
              className={styles.doneAccount}
              onClick={() => dialogRef.current?.close()}
            >
              Done
            </button>
          </footer>
        </dialog>
      )}
    </div>
  );
}
