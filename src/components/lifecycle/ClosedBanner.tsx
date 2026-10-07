/**
 * Shown where records are normally added, once the activity is closed. What
 * can still be done there, if anything, is said in `still` (LIFE-013).
 */
export default function ClosedBanner({ title, still }: { title: string; still?: string }) {
  return (
    <p className="closed-banner" role="status">
      “{title}” is closed{still ? `. ${still}` : ", so records can't be added or changed"}. Use{" "}
      <strong>Reopen…</strong> in the top bar to {still ? "add or remove any" : "continue it"}.
    </p>
  );
}
