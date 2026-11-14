import { useEffect } from "react";

// Remembers how far down a page you were scrolled and puts you back there
// when you return to it (e.g. after going to another screen and pressing
// Back). Pass a key that is unique to the page, and `ready` = true once the
// page content has loaded (so there is something tall enough to scroll to).
export default function useScrollMemory(key, ready = true) {
  // Save the position while scrolling.
  useEffect(() => {
    let timer = null;
    function onScroll() {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        try { localStorage.setItem(key, JSON.stringify({ y: window.scrollY || 0, at: Date.now() })); } catch (e) {}
      }, 150);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (timer) clearTimeout(timer); };
  }, [key]);

  // Put it back once the page has content. Retries briefly because images /
  // late-loading sections can make the page taller after the first paint.
  useEffect(() => {
    if (!ready) return;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) {}
    // ignore positions older than 12 hours
    if (!saved || !(saved.y > 0) || Date.now() - (saved.at || 0) > 12 * 3600 * 1000) return;
    let tries = 0;
    const id = setInterval(() => {
      window.scrollTo(0, saved.y);
      tries += 1;
      if (Math.abs(window.scrollY - saved.y) < 4 || tries >= 10) clearInterval(id);
    }, 80);
    return () => clearInterval(id);
  }, [key, ready]);
}
