/** Shown where records are normally added, once the activity is closed. */
export default function ClosedBanner({ title }: { title: string }) {
  return (
    <p className="closed-banner" role="status">
      “{title}” is closed, so records can't be added or changed. Use <strong>Reopen…</strong> in the
      top bar to continue it.
    </p>
  );
}
