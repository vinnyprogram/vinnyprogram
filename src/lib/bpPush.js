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
