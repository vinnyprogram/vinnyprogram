// Single source of truth for ordering floor names top-down the way a crew
// actually thinks about a building: Attic first, then numbered floors from
// highest to lowest, then anything custom, then Garage, Basement,
// Crawlspace last.
//
// This used to be copied separately into ProjectEstimate.jsx,
// BoardPlasterEstimate.jsx (three times), GCEstimate.jsx, and
// EkotropeReport.jsx. Several of those copies only recognized a fixed list
// ("Attic","3rd","2nd","1st","Basement","Crawlspace") and silently dumped
// any floor outside that list - a "4th" floor, a "5th" floor, "Garage" - at
// the very end instead of sorting it into the right place. That's the exact
// bug already fixed once in the Insulation estimate; this file is what
// every trade should import instead of keeping its own copy, so the fix
// can't quietly go missing from only some of them again.
export function floorSortKey(name) {
  const low = (name || "").trim().toLowerCase();
  if (low === "attic" || low === "roof") return [0, 0];
  const ord = low.match(/^(\d+)(st|nd|rd|th)?$/);
  if (ord) return [1, -Number(ord[1])];
  if (low === "garage") return [3, 0];
  if (low === "basement") return [4, 0];
  if (low === "crawlspace" || low === "crawl space") return [5, 0];
  return [2, low];
}

export function compareFloors(a, b) {
  const [ga, sa] = floorSortKey(a);
  const [gb, sb] = floorSortKey(b);
  if (ga !== gb) return ga - gb;
  return typeof sa === "number" ? sa - sb : String(sa).localeCompare(String(sb));
}

export function sortFloors(arr) {
  return [...arr].sort(compareFloors);
}
