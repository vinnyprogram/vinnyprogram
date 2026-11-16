// Shared by every trade that pushes areas into a Board & Plaster estimate.
// Merge instead of replace: whatever was typed directly in Board & Plaster
// stays. Areas that came from an earlier push from the SAME trade (tagged with
// that trade's name in `source`) are refreshed with the new ones. Older pushes
// made before the tag existed are matched by floor + type + size so they are
// not added a second time.
export function mergeBPAreas(existing, pushed, source){
  const old = Array.isArray(existing) ? existing : [];
  const kept = old.filter(a=>a && a.source!==source);
  const same = (x,y)=> x.floor===y.floor && x.area_type===y.area_type && Math.abs(Number(x.sqft||0)-Number(y.sqft||0))<0.01;
  const hadTagged = old.some(a=>a && a.source===source);
  const fresh = hadTagged ? pushed : pushed.filter(p=>!kept.some(k=>same(k,p)));
  return [...kept, ...fresh];
}

// Which open Board & Plaster estimate should a push go into?
// Only one for the SAME street address. Falling back to "any open estimate of
// this customer" put the new areas on top of a completely different job (and
// renamed its address), so unrelated areas showed up mixed in. If nothing
// matches, the caller creates a new estimate instead.
export function pickBPTarget(openOnes, address) {
  const street = s => String(s || "").split(",")[0].trim().toLowerCase().replace(/\s+/g, " ");
  const want = street(address);
  const list = Array.isArray(openOnes) ? openOnes : [];
  if (want) {
    const hit = list.find(e => street(e.address) === want);
    if (hit) return hit;
  }
  // An open estimate that has no address yet is a safe place to land.
  return list.find(e => !street(e.address)) || null;
}
