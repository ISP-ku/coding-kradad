import styles from "./FormKit.module.css";

/**
 * Shared pieces for every create / assign / add form, so they all look and
 * behave the same: label on top, an optional hint, the error right under the
 * field it belongs to, counters on long text, tappable choices for short
 * lists, and one-click quick picks for common values.
 */

/** aria props that tie an input to its hint and error. */
export function fieldAria(id: string, error?: string, hasHint = false) {
  const describedBy = [hasHint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ");
  return { "aria-invalid": error ? true : undefined, "aria-describedby": describedBy || undefined };
}

export function FormCard({ label, onSubmit, children }: {
  label: string;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <form className={styles.card} onSubmit={onSubmit} noValidate aria-label={label}>
      {children}
    </form>
  );
}

export function Field({ id, label, hint, error, optional, count, children }: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  count?: { value: string; max: number };
  children: React.ReactNode;
}) {
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label htmlFor={id}>{label}</label>
        {optional && <span className={styles.optional}>Optional</span>}
        {count && <span className={styles.count} aria-hidden="true">{count.value.length} / {count.max}</span>}
      </div>
      {hint && <p className={styles.hint} id={`${id}-hint`}>{hint}</p>}
      {children}
      {error && <p className={styles.error} id={`${id}-error`}>{error}</p>}
    </div>
  );
}

/** Two fields side by side on wide screens, stacked on phones. */
export function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}

export type Choice<T extends string> = { value: T; label: string; hint?: string };

/** A short list of options as tappable cards (real radio buttons underneath). */
export function ChoiceGroup<T extends string>({ legend, name, options, value, onChange, error, columns = 2 }: {
  legend: string;
  name: string;
  options: Choice<T>[];
  value: T | "";
  onChange: (value: T) => void;
  error?: string;
  columns?: 2 | 3 | 4;
}) {
  return (
    <fieldset className={styles.choices} aria-describedby={error ? `${name}-error` : undefined}>
      <legend>{legend}</legend>
      <div className={`${styles.choiceGrid} ${styles[`cols${columns}`]}`}>
        {options.map((o) => (
          <label key={o.value} className={styles.choice}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span className={styles.choiceText}>
              <span className={styles.choiceLabel}>{o.label}</span>
              {o.hint && <span className={styles.choiceHint}>{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
      {error && <p className={styles.error} id={`${name}-error`}>{error}</p>}
    </fieldset>
  );
}

/** One-click values for a field ("Tomorrow", "30 min"). */
export function QuickPicks({ label, picks }: { label: string; picks: { label: string; onPick: () => void; active?: boolean }[] }) {
  return (
    <div className={styles.picks} role="group" aria-label={label}>
      {picks.map((p) => (
        <button key={p.label} type="button" className={styles.pick} aria-pressed={p.active ?? undefined} onClick={p.onPick}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

export function FormMessage({ kind, children }: { kind: "error" | "notice"; children: React.ReactNode }) {
  return kind === "error"
    ? <div className={styles.formError} role="alert">{children}</div>
    : <div className={styles.formNotice} role="status">{children}</div>;
}

export function FormActions({ submitLabel, busyLabel, busy, disabled, cancelHref, onCancel }: {
  submitLabel: string;
  busyLabel: string;
  busy: boolean;
  disabled?: boolean;
  cancelHref?: string;
  onCancel?: () => void;
}) {
  return (
    <div className={styles.actions}>
      <button type="submit" className={styles.submit} disabled={busy || disabled}>{busy ? busyLabel : submitLabel}</button>
      {cancelHref && <a className={styles.cancel} href={cancelHref}>Cancel</a>}
      {onCancel && <button type="button" className={styles.cancel} onClick={onCancel}>Cancel</button>}
    </div>
  );
}

// ---- date helpers shared by the forms ------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");
/** YYYY-MM-DD in local time. */
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** YYYY-MM-DDTHH:MM in local time, for datetime-local inputs. */
export const localDateTime = (d: Date) => `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const daysFromNow = (n: number, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() + n);
  return d;
};
