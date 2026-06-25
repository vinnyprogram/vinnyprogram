import { useState, useEffect, useCallback } from "react";
import { flushQueue, queueLength } from "../utils/offlineQueue";

export default function OfflineBanner() {
  const [online, setOnline]     = useState(navigator.onLine);
  const [syncing, setSyncing]   = useState(false);
  const [queued, setQueued]     = useState(queueLength());
  const [justSynced, setJustSynced] = useState(0);

  const sync = useCallback(async () => {
    const n = queueLength();
    if (!n) return;
    setSyncing(true);
    try {
      const done = await flushQueue();
      if (done > 0) {
        setJustSynced(done);
        setTimeout(() => setJustSynced(0), 4000);
      }
      setQueued(queueLength());
    } catch(e) { /* stay queued */ }
    setSyncing(false);
  }, []);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      setQueued(queueLength());
      sync();
    };
    const goOffline = () => {
      setOnline(false);
      setQueued(queueLength());
    };
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [sync]);

  // Refresh queue count every 5s
  useEffect(() => {
    const t = setInterval(() => setQueued(queueLength()), 5000);
    return () => clearInterval(t);
  }, []);

  // Nothing to show when online and no pending items
  if (online && !syncing && !justSynced && queued === 0) return null;

  const style = {
    position: "fixed",
    bottom: 16,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 9999,
    borderRadius: 24,
    padding: "8px 18px",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "Inter,system-ui,sans-serif",
    display: "flex",
    alignItems: "center",
    gap: 8,
    boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
    whiteSpace: "nowrap",
  };

  if (!online) return (
    <div style={{ ...style, background: "#1e293b", color: "#fff" }}>
      <span>📵</span>
      <span>Offline — measurements saved locally{queued > 0 ? ` (${queued} pending)` : ""}</span>
    </div>
  );

  if (syncing) return (
    <div style={{ ...style, background: "#1d4ed8", color: "#fff" }}>
      <span>🔄</span>
      <span>Syncing {queued} item{queued !== 1 ? "s" : ""}…</span>
    </div>
  );

  if (justSynced > 0) return (
    <div style={{ ...style, background: "#059669", color: "#fff" }}>
      <span>✅</span>
      <span>{justSynced} item{justSynced !== 1 ? "s" : ""} synced to database</span>
    </div>
  );

  if (queued > 0) return (
    <div style={{ ...style, background: "#f59e0b", color: "#fff", cursor: "pointer" }}
      onClick={sync}>
      <span>⏳</span>
      <span>{queued} pending — tap to sync</span>
    </div>
  );

  return null;
}
