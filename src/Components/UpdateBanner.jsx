import { useEffect, useState } from "react";

// Polls the small, unhashed version.json file (written fresh on every build -
// see vite.config.js) and compares it to the version baked into THIS running
// bundle. If they differ, a newer build has been deployed since this tab/app
// was opened - shown as a dismissible-but-persistent banner rather than an
// automatic reload, since force-reloading mid-edit could lose whatever
// someone is in the middle of typing.
export default function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.version && data.version !== __APP_VERSION__) {
          setUpdateAvailable(true);
        }
      } catch (e) {
        // Offline or request failed - say nothing. Only show the banner on a
        // confirmed mismatch, never on uncertainty.
      }
    }

    check();
    const interval = setInterval(check, 60000);
    // Also check whenever the tab/app regains focus (e.g. switching back
    // from another app) - the exact moment someone's about to resume typing
    // on what might be a stale session.
    function onVisible() {
      if (document.visibilityState === "visible") check();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 10000,
      background: "#059669", color: "#fff", padding: "10px 14px",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
      fontSize: 13, fontWeight: 600, fontFamily: "system-ui,sans-serif",
      boxShadow: "0 2px 8px rgba(0,0,0,.15)",
    }}>
      <span>🔄 A new version of CUB is available.</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          border: "none", background: "#fff", color: "#059669",
          padding: "5px 14px", borderRadius: 6, fontWeight: 700,
          fontSize: 12, cursor: "pointer",
        }}
      >
        Refresh now
      </button>
    </div>
  );
}
