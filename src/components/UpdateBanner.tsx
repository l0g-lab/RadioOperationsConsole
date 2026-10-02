import { useEffect, useState } from "react";
import { checkForUpdate, dismissUpdate, installUpdate, useUpdateState } from "../updates";

/** How soon after starting the app to look for an update, and how often after. */
const FIRST_CHECK_MS = 10_000;
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

/**
 * Offers a newer release when there is one: what's new, and Update now,
 * which downloads the installer for this computer and opens it (updates.ts).
 */
export default function UpdateBanner() {
  const state = useUpdateState();
  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => {
    const first = setTimeout(() => checkForUpdate(), FIRST_CHECK_MS);
    const daily = setInterval(() => checkForUpdate(), CHECK_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(daily);
    };
  }, []);

  // A failed install keeps its banner, with the reason, so it can be tried again.
  const update =
    state.kind === "available" || state.kind === "downloading" || state.kind === "opened"
      ? state.update
      : state.kind === "error"
        ? state.update
        : undefined;
  if (!update) return null;

  let message: React.ReactNode;
  if (state.kind === "downloading") {
    message = (
      <>
        Downloading version {update.version}…{" "}
        {state.percent != null && (
          <>
            <progress max={100} value={state.percent} aria-label="Download progress" /> {state.percent}%
          </>
        )}
      </>
    );
  } else if (state.kind === "opened") {
    message =
      state.how === "installer_running" ? (
        <>The installer for version {update.version} is starting, and this app will close so it can be updated.</>
      ) : state.how === "in_software_installer" ? (
        <>
          The installer for version {update.version} is open (saved to <code className="upgrade-banner-path">{state.path}</code>). When it's
          finished, restart Radio Operations Console.
        </>
      ) : (
        <>
          Version {update.version} is saved to <code className="upgrade-banner-path">{state.path}</code>, ready to run. Close
          this app and start the new file in its place.
        </>
      );
  } else {
    message = (
      <>
        <strong>Version {update.version} is available</strong> (you have {update.current_version}).{" "}
        {update.installer
          ? "Everything you've entered is saved; updating downloads the installer and opens it."
          : <>Get it from <code className="upgrade-banner-path">{update.release_url}</code>.</>}
        {state.kind === "error" && <span className="weather-area-error"> {state.message}</span>}
      </>
    );
  }

  const offering = state.kind === "available" || state.kind === "error";
  return (
    <div className="upgrade-banner update-banner" role="status">
      <span>
        {message}
        {showNotes && update.notes && <pre className="update-notes">{update.notes}</pre>}
      </span>
      {state.kind !== "downloading" && (
        <span className="operator-row-actions">
          {offering && update.notes && (
            <button className="link-button" aria-expanded={showNotes} onClick={() => setShowNotes((v) => !v)}>
              {showNotes ? "Hide what's new" : "What's new"}
            </button>
          )}
          {offering && update.installer && (
            <button onClick={installUpdate}>{state.kind === "error" ? "Try again" : "Update now"}</button>
          )}
          <button className="link-button" onClick={dismissUpdate}>
            {offering ? "Later" : "Dismiss"}
          </button>
        </span>
      )}
    </div>
  );
}
