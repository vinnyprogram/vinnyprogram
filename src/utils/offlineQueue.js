/**
 * Offline Queue
 * When a Supabase save fails because there's no internet, the operation
 * is stored in localStorage. When the connection returns, all queued
 * operations are replayed automatically.
 */

import { supabase } from "../lib/supabase";

const QUEUE_KEY = "offline_queue";

// ── Read / write the queue ────────────────────────────────────────────────────
export function getQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); }
  catch(e) { return []; }
}

function saveQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
  catch(e) { console.warn("Queue save error:", e); }
}

export function queueLength() { return getQueue().length; }

// ── Add an operation to the queue ─────────────────────────────────────────────
export function enqueue(op) {
  const q = getQueue();
  q.push({ ...op, id: Date.now() + Math.random(), timestamp: new Date().toISOString() });
  saveQueue(q);
}

// ── Replay all queued operations ──────────────────────────────────────────────
export async function flushQueue(onProgress) {
  const q = getQueue();
  if (!q.length) return 0;

  let succeeded = 0;
  const remaining = [];

  for (const op of q) {
    try {
      let error = null;

      if (op.type === "upsert") {
        ({ error } = await supabase.from(op.table).upsert(op.data, op.opts || {}));
      } else if (op.type === "insert") {
        ({ error } = await supabase.from(op.table).insert(op.data));
      } else if (op.type === "update") {
        ({ error } = await supabase.from(op.table).update(op.data).eq("id", op.id));
      } else if (op.type === "delete") {
        ({ error } = await supabase.from(op.table).delete().eq("id", op.id));
      }

      if (error) throw error;
      succeeded++;
      if (onProgress) onProgress(succeeded, q.length);
    } catch(e) {
      // Still failing — keep in queue for next retry
      remaining.push(op);
    }
  }

  saveQueue(remaining);
  return succeeded;
}

// ── Safe save wrapper ─────────────────────────────────────────────────────────
// Use this instead of direct supabase calls for field-critical saves.
// If online: saves immediately. If offline: queues for later sync.
export async function safeSave(type, table, data, opts = {}) {
  if (!navigator.onLine) {
    enqueue({ type, table, data, opts });
    return { queued: true };
  }
  try {
    let result;
    if (type === "upsert") result = await supabase.from(table).upsert(data, opts);
    else if (type === "insert") result = await supabase.from(table).insert(data);
    else if (type === "update") result = await supabase.from(table).update(data).eq("id", opts.id);

    if (result?.error) throw result.error;
    return { saved: true, data: result?.data };
  } catch(e) {
    // Network error — queue it
    if (!navigator.onLine || e.message?.includes("network") || e.message?.includes("fetch")) {
      enqueue({ type, table, data, opts });
      return { queued: true };
    }
    throw e;
  }
}
