// Shared activity log utility. Every page that imports this writes to the
// SAME localStorage-backed log, so you get one unified timeline across the
// whole app instead of a separate, disconnected log per page.
const DEBUG_LOG_KEY = "insulationpro_debug_log";
const MAX_ENTRIES = 300;

export function logEvent(msg, page){
  try {
    const prev = JSON.parse(localStorage.getItem(DEBUG_LOG_KEY) || "[]");
    const entry = { t: new Date().toLocaleString(), page: page || "", msg };
    const next = [...prev, entry];
    const trimmed = next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    localStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(trimmed));
    return trimmed;
  } catch(e){
    return [];
  }
}

export function getDebugLog(){
  try { return JSON.parse(localStorage.getItem(DEBUG_LOG_KEY) || "[]"); }
  catch(e){ return []; }
}

export function clearDebugLog(){
  try { localStorage.removeItem(DEBUG_LOG_KEY); } catch(e){}
}
