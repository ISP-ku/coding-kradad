export type IconName = "grid" | "book" | "chat" | "user" | "power" | "menu" | "calendar";

const paths: Record<IconName, React.ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </>
  ),
  book: <path d="M12 5v16M3 3c4 0 6 1 9 3 3-2 5-3 9-3v15c-4 0-6 1-9 3-3-2-5-3-9-3z" />,
  chat: (
    <>
      <path d="M4 4h16v13H9l-5 4z" />
      <path d="M8 10h.01M12 10h.01M16 10h.01" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="7" r="4" />
      <path d="M4 22v-3a8 8 0 0 1 16 0v3" />
    </>
  ),
  power: <path d="M12 2v9M6 5a9 9 0 1 0 12 0" />,
  menu: <path d="M3 5h18M3 12h18M3 19h18" />,
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="1" />
      <path d="M8 3v4M16 3v4M4 11h16M8 15h2M14 15h2" />
    </>
  ),
};

// width/height are attributes (not inline styles) so a parent's CSS can resize it.
export default function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={21}
      height={21}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {paths[name]}
    </svg>
  );
}
