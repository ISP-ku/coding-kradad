import { ROLE_LABEL, type AccessAccount, type AccessRole } from "@/lib/access";
import styles from "./AccessManager.module.css";

const ROLES: AccessRole[] = ["student", "ta", "lecturer"];

/**
 * One member of the selected course. LECTURER_EMAILS accounts and the
 * signed-in lecturer cannot be removed or have their role changed; only a
 * LECTURER_EMAILS account itself may manage its own password.
 */
export default function AccessMemberRow({
  account: a, courseCode, courseCodes, busy, onRole, onRemove, onMakePassword, onRemovePassword,
}: {
  account: AccessAccount;
  /** The course being managed, for the Remove button's label. */
  courseCode: string;
  /** Every course this account is in. */
  courseCodes: string[];
  busy: boolean;
  onRole: (role: AccessRole) => void;
  onRemove: () => void;
  onMakePassword: () => void;
  onRemovePassword: () => void;
}) {
  const locked = a.protected || a.is_self;
  const passwordLocked = a.protected && !a.is_self;
  const lockReason = a.protected ? "Set in server configuration" : a.is_self ? "You" : "";

  return (
    <tr>
      <td className={styles.email}>
        {a.email}
        {lockReason && <span className={styles.chip}>{lockReason}</span>}
      </td>
      <td>
        <select
          aria-label={`Role for ${a.email}`}
          value={a.role}
          disabled={busy || locked}
          onChange={(e) => onRole(e.target.value as AccessRole)}
        >
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </td>
      <td>{courseCodes.join(", ")}</td>
      <td>
        <div className={styles.passwordCell}>
          <button
            type="button"
            className={styles.small}
            aria-label={`${a.has_password ? "New password" : "Create password"} for ${a.email}`}
            disabled={busy || passwordLocked}
            onClick={onMakePassword}
          >
            {a.has_password ? "New password" : "Create password"}
          </button>
          {a.has_password && (
            <button
              type="button"
              className={styles.linkish}
              aria-label={`Remove password for ${a.email}`}
              disabled={busy || passwordLocked}
              onClick={onRemovePassword}
            >
              Remove
            </button>
          )}
        </div>
      </td>
      <td>
        <button
          type="button"
          className={styles.remove}
          aria-label={`Remove ${a.email} from ${courseCode}`}
          disabled={busy || locked}
          onClick={onRemove}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}
