import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import styles from "./page.module.css";

// API_BASE_URL should point at the FastAPI backend's OAuth start routes,
// e.g. GET /login/discord, /login/google, /login/line (same shape as the
// old Flask `login(provider)` view).
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:8000";

export default async function LoginPage() {
  const user = await getSessionUser();

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {user ? (
          <div className={styles.userBox}>
            {user.avatar_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar_url} alt="avatar" />
            )}
            <h2>Welcome, {user.username}</h2>
            <p>
              <small>
                via {user.provider[0].toUpperCase() + user.provider.slice(1)}
              </small>
            </p>
            <p>
              <Link
                href="/dashboard"
                className={`${styles.discordBtn} ${styles.loginBtn} ${styles.action}`}
              >
                Go to Dashboard
              </Link>
            </p>
            <p>
              <a className={styles.secondary} href={`${API_BASE}/logout`}>
                Log out
              </a>
            </p>
          </div>
        ) : (
          <>
            <h1>My Course Dashboard</h1>
            <p>Sign in to continue</p>
            <a
              className={`${styles.loginBtn} ${styles.discordBtn}`}
              href={`${API_BASE}/login/discord`}
            >
              Login with Discord
            </a>
            <a
              className={`${styles.loginBtn} ${styles.googleBtn}`}
              href={`${API_BASE}/login/google`}
            >
              Login with Google (Classroom)
            </a>
            <a
              className={`${styles.loginBtn} ${styles.lineBtn}`}
              href={`${API_BASE}/login/line`}
            >
              Login with LINE
            </a>
          </>
        )}
      </div>
    </main>
  );
}
