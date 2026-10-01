import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

const C = { bg:"#f4f5f7", white:"#fff", ink:"#0f172a", muted:"#64748b",
  faint:"#94a3b8", border:"#e2e8f0", green:"#059669" };
const I = { width:"100%", padding:"7px 9px", borderRadius:7, border:`1px solid ${C.border}`,
  fontSize:13, boxSizing:"border-box" };
const Btn = { border:`1px solid ${C.border}`, background:"#fff", color:C.ink,
  padding:"8px 14px", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600 };
const BtnD = { border:"none", background:C.green, color:"#fff",
  padding:"8px 16px", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:700 };

// Spoken numbers often come through as words ("twenty two") rather than
// digits, depending on the browser's speech engine - this converts them so
// "twenty two by ten" and "22 by 10" both parse the same way.
const NUM_WORDS = {zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,
  ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,
  eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};

function wordsToDigits(text){
  const words = text.toLowerCase().split(/\s+/);
  const out = [];
  for(let i=0;i<words.length;i++){
    const w = words[i].replace(/[^a-z]/g,"");
    if(NUM_WORDS[w]!==undefined){
      let val = NUM_WORDS[w];
      // "twenty two" -> 22 (tens word followed by a ones word)
      const next = (words[i+1]||"").replace(/[^a-z]/g,"");
      if(val>=20 && val%10===0 && NUM_WORDS[next]!==undefined && NUM_WORDS[next]<10){
        val += NUM_WORDS[next];
        i++;
      }
      out.push(String(val));
    } else {
      out.push(words[i]);
    }
  }
  return out.join(" ");
}

// Finds the longest matching entry from a list of known values within the
// transcript - longest-first so "exterior wall" matches before a shorter
// unrelated "wall" entry would.
function findBestMatch(text, candidates){
  const low = text.toLowerCase();
  const sorted = [...candidates].filter(Boolean).sort((a,b)=>b.length-a.length);
  for(const c of sorted){
    if(low.includes(c.toLowerCase())) return c;
  }
  return null;
}

const MATERIAL_ABBREV = { cc:"Closed Cell", oc:"Open Cell" };

function matchMaterial(text, materials){
  const low = text.toLowerCase().trim();
  // check abbreviation first ("cc", "oc")
  for(const [abbrev,full] of Object.entries(MATERIAL_ABBREV)){
    if(low===abbrev || low.startsWith(abbrev+" ") || low.endsWith(" "+abbrev)){
      const real = materials.find(m=>m.name.toLowerCase().includes(full.toLowerCase()));
      if(real) return real.name;
      return full;
    }
  }
  return findBestMatch(text, materials.map(m=>m.name));
}

function parseMeasurements(text){
  // Segments separated by "plus"; each segment should contain an H x L pair.
  const segments = text.split(/\bplus\b/i).map(s=>s.trim()).filter(Boolean);
  const measurements = [];
  segments.forEach(seg=>{
    const m = seg.match(/(\d+(?:\.\d+)?)\s*(?:x|by)\s*(\d+(?:\.\d+)?)/i);
    if(m){
      const h = parseFloat(m[1]), l = parseFloat(m[2]);
      measurements.push({ h, l, q:1, sqft: Math.round(h*l*100)/100 });
    }
  });
  return measurements;
}

// The actual parser - walks the transcript in the expected order: floor ->
// area type -> thickness -> material/combo -> measurements. Each piece is
// located by finding where it starts in the remaining text, then that
// section is consumed before looking for the next piece - this keeps,
// e.g., a floor name from accidentally being matched again inside the
// measurements section.
function parseEntry(rawTranscript, { floors, areaTypes, thickOpts, materials }){
  const transcript = wordsToDigits(rawTranscript);
  const result = { floor:null, area_type:null, thickness_in:null, material:null, combo:null, measurements:[], raw:rawTranscript };

  const floor = findBestMatch(transcript, floors);
  result.floor = floor;

  const areaType = findBestMatch(transcript, areaTypes);
  result.area_type = areaType;

  const thickness = findBestMatch(transcript, thickOpts);
  result.thickness_in = thickness;

  // "combo of X and Y"
  const comboMatch = transcript.match(/combo of (.+?) and (.+?)(?:\.|,|measure|$)/i);
  if(comboMatch){
    const partA = comboMatch[1].trim(), partB = comboMatch[2].trim();
    const parseComboPart = (part)=>{
      const thickMatch = part.match(/(\d+(?:\.\d+)?)\s*(?:"|inch|in)?/i);
      const matchedMat = matchMaterial(part, materials);
      return { thickness_in: thickMatch?`${thickMatch[1]}in`:"", material: matchedMat||part.trim() };
    };
    result.combo = [parseComboPart(partA), parseComboPart(partB)];
  } else {
    // single material - look for it after the thickness token, if any
    const afterThickness = thickness ? transcript.split(thickness).slice(1).join(thickness) : transcript;
    result.material = matchMaterial(afterThickness, materials) || findBestMatch(transcript, materials.map(m=>m.name));
  }

  // measurements - everything after "measures of" / "measurements is" / "measurement"
  const measMatch = transcript.match(/measure(?:s|ments)?\s*(?:of|is|are)?\s*(.+)/i);
  if(measMatch){
    result.measurements = parseMeasurements(measMatch[1]);
  }

  return result;
}

export default function VoiceAreaCapture({ floors, areaTypes, thickOpts, materials, onClose, onTransferEntries }){
  const [listening, setListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [staged, setStaged] = useState([]); // [{id, selected, ...parsed fields}]
  const [supported, setSupported] = useState(true);
  const [lastError, setLastError] = useState("");
  const recognitionRef = useRef(null);
  const bufferRef = useRef(""); // accumulates finalized speech since the last "done"/"another line"
  // Mirrors `listening` into a ref so the onend handler (set up once, inside
  // a useEffect that runs on mount) always checks the CURRENT value, not
  // the stale `listening=false` it would otherwise close over from the
  // very first render - that stale check is why auto-restart never fired
  // once the browser's engine silently stopped itself (which happens often,
  // even in "continuous" mode, after a short pause or timeout).
  const listeningRef = useRef(false);

  useEffect(()=>{
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR){ setSupported(false); return; }
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event)=>{
      let finalChunk = "";
      let interimChunk = "";
      for(let i=event.resultIndex;i<event.results.length;i++){
        const transcriptPiece = event.results[i][0].transcript;
        if(event.results[i].isFinal) finalChunk += transcriptPiece + " ";
        else interimChunk += transcriptPiece;
      }
      if(finalChunk){
        bufferRef.current += finalChunk;
        // Check for an end-of-entry control word in what's been said so far.
        const endMatch = bufferRef.current.match(/\b(done|another line)\b/i);
        if(endMatch){
          const beforeEnd = bufferRef.current.slice(0, endMatch.index);
          commitEntry(beforeEnd);
          bufferRef.current = bufferRef.current.slice(endMatch.index + endMatch[0].length);
        }
      }
      setLiveTranscript(bufferRef.current + interimChunk);
    };
    recognition.onerror = (event)=>{
      // Surfaced to the user now instead of silently swallowed - this is
      // the actual diagnostic info needed when nothing seems to happen.
      const messages = {
        "not-allowed": "Microphone access was denied. Check your browser/site permissions and try again.",
        "no-speech": "No speech detected — try again, a bit closer to the mic.",
        "audio-capture": "No microphone found on this device.",
        "network": "A network error interrupted speech recognition.",
      };
      setLastError(messages[event.error] || `Speech recognition error: ${event.error}`);
      if(event.error==="not-allowed" || event.error==="audio-capture"){
        setListening(false);
        listeningRef.current = false;
      }
    };
    recognition.onend = ()=>{
      // Auto-restart only if we're still SUPPOSED to be listening - checked
      // via the ref (always current), not the state variable this closure
      // would otherwise have captured once, back at mount time.
      if(listeningRef.current){
        try{ recognition.start(); }catch(e){ /* already running - ignore */ }
      }
    };

    recognitionRef.current = recognition;
    return ()=>{ try{ recognition.stop(); }catch(e){} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  function commitEntry(transcript){
    const trimmed = transcript.trim();
    if(!trimmed) return;
    const parsed = parseEntry(trimmed, { floors, areaTypes, thickOpts, materials });
    setStaged(p=>[...p, { id: Date.now()+Math.random(), selected:true, ...parsed }]);
  }

  function startListening(){
    if(!supported) return;
    setLastError("");
    bufferRef.current = "";
    setLiveTranscript("");
    setListening(true);
    listeningRef.current = true;
    try{ recognitionRef.current?.start(); }catch(e){ setLastError(`Could not start listening: ${e.message}`); }
  }
  function stopListening(){
    setListening(false);
    listeningRef.current = false;
    try{ recognitionRef.current?.stop(); }catch(e){}
    // Commit whatever's left in the buffer as a final entry too, in case
    // they stopped with the button instead of saying "done".
    if(bufferRef.current.trim()) commitEntry(bufferRef.current);
    bufferRef.current = "";
    setLiveTranscript("");
  }

  function updateStaged(id, field, val){
    setStaged(p=>p.map(s=>s.id===id?{...s,[field]:val}:s));
  }
  function removeStaged(id){
    setStaged(p=>p.filter(s=>s.id!==id));
  }
  function toggleSelected(id){
    setStaged(p=>p.map(s=>s.id===id?{...s,selected:!s.selected}:s));
  }

  function doTransfer(onlySelected){
    const toSend = staged.filter(s=>onlySelected ? s.selected : true);
    if(toSend.length===0) return;
    onTransferEntries(toSend);
    setStaged(p=>onlySelected ? p.filter(s=>!s.selected) : []);
  }

  return createPortal(
    <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(15,23,42,0.5)",
        display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{background:C.white,borderRadius:"16px 16px 0 0",width:"100%",maxWidth:480,
          maxHeight:"85vh",overflowY:"auto",padding:16,boxShadow:"0 -8px 32px rgba(0,0,0,.3)"}}>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:15,fontWeight:800,color:C.ink}}>🎙️ Voice Entry</div>
          <button onClick={onClose} style={{border:"none",background:"none",color:C.faint,fontSize:20,cursor:"pointer"}}>✕</button>
        </div>

        {!supported && (
          <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:10,fontSize:12,color:"#991b1b",marginBottom:10}}>
            Voice recognition isn't supported in this browser. Try Chrome or Edge.
          </div>
        )}
        {lastError && (
          <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:10,fontSize:12,color:"#991b1b",marginBottom:10}}>
            ⚠️ {lastError}
          </div>
        )}

        <div style={{fontSize:11,color:C.muted,marginBottom:10,lineHeight:1.5}}>
          Say: floor → area type → thickness → material (or "combo of X and Y") → "measures of" then H×L pairs
          separated by "<b>plus</b>" → "<b>done</b>" or "<b>another line</b>" to finish that one and start the next.
        </div>

        <div style={{display:"flex",gap:8,marginBottom:10}}>
          {!listening ? (
            <button onClick={startListening} disabled={!supported} style={{...BtnD,flex:1}}>🎙️ Let's Start</button>
          ) : (
            <button onClick={stopListening} style={{...Btn,flex:1,background:"#fef2f2",borderColor:"#fecaca",color:"#991b1b"}}>⏹ Stop</button>
          )}
        </div>

        {listening && (
          <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,padding:10,marginBottom:10,fontSize:12,color:"#166534",minHeight:40}}>
            {liveTranscript || "Listening…"}
          </div>
        )}

        {staged.length>0 && (
          <>
            <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",marginBottom:8}}>
              Staged ({staged.length}) — review and edit before transferring
            </div>
            {staged.map(s=>(
              <div key={s.id} style={{border:`1px solid ${C.border}`,borderRadius:8,padding:10,marginBottom:8,background: s.selected?"#fff":"#f8fafc"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <input type="checkbox" checked={s.selected} onChange={()=>toggleSelected(s.id)} />
                  <span style={{fontSize:11,color:C.faint,flex:1}}>"{s.raw}"</span>
                  <button onClick={()=>removeStaged(s.id)} style={{border:"none",background:"none",color:"#dc2626",cursor:"pointer",fontSize:14}}>✕</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
                  <select value={s.floor||""} onChange={e=>updateStaged(s.id,"floor",e.target.value)} style={I}>
                    <option value="">Floor…</option>
                    {floors.map(f=><option key={f} value={f}>{f}</option>)}
                  </select>
                  <select value={s.area_type||""} onChange={e=>updateStaged(s.id,"area_type",e.target.value)} style={I}>
                    <option value="">Area type…</option>
                    {areaTypes.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
                  <select value={s.thickness_in||""} onChange={e=>updateStaged(s.id,"thickness_in",e.target.value)} style={I}>
                    <option value="">Thickness…</option>
                    {thickOpts.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                  {!s.combo ? (
                    <select value={s.material||""} onChange={e=>updateStaged(s.id,"material",e.target.value)} style={I}>
                      <option value="">Material…</option>
                      {materials.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
                    </select>
                  ) : (
                    <div style={{fontSize:11,color:C.green,fontWeight:700,alignSelf:"center"}}>
                      Combo: {s.combo[0]?.material} + {s.combo[1]?.material}
                    </div>
                  )}
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {(s.measurements||[]).length===0 && <span style={{fontSize:11,color:"#b45309"}}>⚠ No measurements recognized — add manually after transfer</span>}
                  {(s.measurements||[]).map((m,mi)=>(
                    <span key={mi} style={{background:"#dcfce7",borderRadius:4,padding:"2px 6px",fontSize:11,color:"#166534"}}>
                      {m.h}×{m.l} ={fmt(m.sqft)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <button onClick={()=>doTransfer(true)} style={{...BtnD,flex:1}}>✓ Transfer Selected</button>
              <button onClick={()=>doTransfer(false)} style={{...Btn,flex:1}}>Transfer All</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

function fmt(n){ return Number(n||0).toLocaleString("en-US",{maximumFractionDigits:0}); }
