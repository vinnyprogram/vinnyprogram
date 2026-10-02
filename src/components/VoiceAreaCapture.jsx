import { useState, useRef } from "react";
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

// "third floor" needs to become "3rd" to match a floor tab named "3rd" -
// ordinal words, not the cardinal numbers above.
const ORDINAL_WORDS = {first:"1st",second:"2nd",third:"3rd",fourth:"4th",fifth:"5th",
  sixth:"6th",seventh:"7th",eighth:"8th",ninth:"9th",tenth:"10th"};
function ordinalsToDigits(text){
  let out = text;
  for(const [word,digit] of Object.entries(ORDINAL_WORDS)){
    out = out.replace(new RegExp(`\\b${word}\\b`,"gi"), digit);
  }
  return out;
}

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

// Normalizes small, predictable differences between how a value is written
// ("Roof Rafter w/ Strapping") and how someone naturally says it ("roof
// rafters with strapping") - expands "w/" to "with", and strips a trailing
// "s" from each word so plurals match singulars either direction.
function normalizeForMatch(text){
  return text.toLowerCase()
    .replace(/\bw\//g," with ")
    .split(/\s+/)
    .map(w=>w.replace(/s$/,""))
    .join(" ")
    .trim();
}

function escapeRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }

// A candidate like "2x12" needs digit-boundary awareness - plain substring
// search would "find" it hiding inside an unrelated "12x12" (the digits
// 2,x,1,2 literally appear starting at position 1 of "12x12"), which both
// produces the wrong thickness AND, when that match later gets removed
// from the text, mangles the real "12x12" measurement into nothing. Only
// candidates that start or end with a digit need this extra care - word-
// based candidates like area types don't have this risk.
function safeIncludes(text, candidate){
  const startsOrEndsDigit = /^\d/.test(candidate) || /\d$/.test(candidate);
  if(!startsOrEndsDigit) return text.toLowerCase().includes(candidate.toLowerCase());
  const re = new RegExp(`(?<!\\d)${escapeRegex(candidate.toLowerCase())}(?!\\d)`);
  return re.test(text.toLowerCase());
}

// Finds the best matching entry from a list of known values within the
// transcript. Tries an exact substring match first (longest candidate
// first, so "exterior wall" matches before a shorter unrelated "wall"
// would); if nothing matches exactly, falls back to a normalized
// comparison (handles "w/" vs "with", plurals vs singulars, and a word or
// two being misheard) requiring most of the candidate's words to actually
// appear in the transcript.
function findBestMatch(text, candidates){
  const sorted = [...candidates].filter(Boolean).sort((a,b)=>b.length-a.length);
  for(const c of sorted){
    if(safeIncludes(text, c)) return c;
  }
  const normText = normalizeForMatch(text);
  for(const c of sorted){
    const candWords = normalizeForMatch(c).split(/\s+/).filter(w=>w.length>2);
    if(candWords.length===0) continue;
    const hits = candWords.filter(w=>normText.includes(w)).length;
    // A single word being off (e.g. one mis-heard syllable) shouldn't block
    // the whole match - only requires more than half instead of nearly all.
    if(hits/candWords.length > 0.5) return c;
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
  // Scans for every H x L pattern directly, rather than first splitting on
  // "plus" - people don't always say "plus" between pairs (a comma, "and",
  // or nothing at all are all natural too), and splitting on one specific
  // word first meant anything after a differently-worded separator never
  // got looked at.
  const measurements = [];
  const regex = /(\d+(?:\.\d+)?)\s*(?:x|by|times)\s*(\d+(?:\.\d+)?)/gi;
  let m;
  while((m = regex.exec(text)) !== null){
    const h = parseFloat(m[1]), l = parseFloat(m[2]);
    measurements.push({ h, l, q:1, sqft: Math.round(h*l*100)/100 });
  }
  return measurements;
}

// Removes the FIRST occurrence of a matched phrase from the text (not just
// checks whether it's there) - used so a word that was already claimed by
// one field (e.g. "floor" as part of a floor name) can't also get picked up
// by a later field that happens to share that word (e.g. a literal "Floor"
// area type).
function consume(text, phrase){
  if(!phrase) return text;
  const startsOrEndsDigit = /^\d/.test(phrase) || /\d$/.test(phrase);
  const idx = startsOrEndsDigit
    ? text.toLowerCase().search(new RegExp(`(?<!\\d)${escapeRegex(phrase.toLowerCase())}(?!\\d)`))
    : text.toLowerCase().indexOf(phrase.toLowerCase());
  if(idx===-1) return text;
  return text.slice(0,idx) + " " + text.slice(idx+phrase.length);
}

// The actual parser - walks the transcript in order: floor -> area type ->
// thickness -> material/combo -> measurements. Each matched piece is
// removed from the working text before looking for the next one, so a word
// that appears in more than one list (e.g. "floor") can't get matched
// twice for two different fields.
function parseEntry(rawTranscript, { floors, areaTypes, thickOpts, materials }){
  let remaining = ordinalsToDigits(wordsToDigits(rawTranscript));
  const result = { floor:null, area_type:null, thickness_in:null, material:null, combo:null, measurements:[], raw:rawTranscript };

  const floor = findBestMatch(remaining, floors);
  result.floor = floor;
  remaining = consume(remaining, floor);
  // "third floor" -> floor name "3rd" gets consumed above, but the
  // leftover standalone word "floor" would otherwise go on to falsely
  // match a literal "Floor" area type later - in practice "[ordinal]
  // floor" at the start of a sentence is naming the level, essentially
  // never the area type, so drop that leftover word too.
  if(floor) remaining = remaining.replace(/\bfloor\b/i," ");

  const areaType = findBestMatch(remaining, areaTypes);
  result.area_type = areaType;
  remaining = consume(remaining, areaType);

  const thickness = findBestMatch(remaining, thickOpts);
  result.thickness_in = thickness;
  remaining = consume(remaining, thickness);

  // "combo of X and Y" / "combo with X and Y" - people say both naturally.
  // "combo of X and Y", "combo with X and Y", or just "combo, X and Y" -
  // the connector word is optional since people don't always say one.
  const comboMatch = remaining.match(/combo,?\s*(?:of|with)?\s*(.+?)\s+and\s+(.+?)(?:\.|,|measure|$)/i);
  if(comboMatch){
    const partA = comboMatch[1].trim(), partB = comboMatch[2].trim();
    const parseComboPart = (part)=>{
      const thickMatch = part.match(/(\d+(?:\.\d+)?)\s*(?:"|inch|in)?/i);
      const matchedMat = matchMaterial(part, materials);
      return { thickness_in: thickMatch?`${thickMatch[1]}in`:"", material: matchedMat||part.trim() };
    };
    result.combo = [parseComboPart(partA), parseComboPart(partB)];
    remaining = remaining.slice(0, comboMatch.index) + " " + remaining.slice(comboMatch.index + comboMatch[0].length);
  } else {
    result.material = matchMaterial(remaining, materials);
    if(result.material) remaining = consume(remaining, result.material);
  }

  // Measurements - prefer the "measures of"/"measurements is" trigger
  // phrase when it's actually said, but don't require it: if nothing
  // follows that trigger, just scan whatever's left for H x L patterns
  // directly, since people don't always say the trigger phrase.
  const measMatch = remaining.match(/measure(?:s|ments)?\s*(?:of|is|are)?\s*(.+)/i);
  result.measurements = parseMeasurements(measMatch ? measMatch[1] : remaining);

  return result;
}

export default function VoiceAreaCapture({ floors, areaTypes, thickOpts, materials, onClose, onTransferEntries }){
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false); // uploading/transcribing after Stop
  const [liveTranscript, setLiveTranscript] = useState("");
  const [staged, setStaged] = useState([]); // [{id, selected, ...parsed fields}]
  const [lastError, setLastError] = useState("");
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Browser-native SpeechRecognition (webkitSpeechRecognition) turned out to
  // be unreliable across real devices - "service-not-allowed" on iOS,
  // outright denial on Android, even with continuous mode tuned per-
  // platform. This replaces it with a much more broadly-supported approach:
  // the browser only records plain audio (MediaRecorder), and a server-side
  // function (/api/transcribe) does the actual speech-to-text via OpenAI.
  // Everything downstream - parseEntry, commitEntry, the staged-entry UI -
  // is unchanged, since it only ever needed the resulting text.

  function getSupportedMimeType(){
    const types = ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus"];
    for(const type of types){ if(MediaRecorder.isTypeSupported(type)) return type; }
    return "";
  }

  async function startListening(){
    setLastError("");
    setLiveTranscript("");

    if(!navigator.mediaDevices?.getUserMedia){
      setLastError("Microphone recording isn't supported in this browser.");
      return;
    }

    try{
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      mediaStreamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const recorder = mimeType ? new MediaRecorder(stream,{mimeType}) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event)=>{
        if(event.data && event.data.size>0) audioChunksRef.current.push(event.data);
      };
      recorder.onerror = ()=>{
        setLastError("The microphone recording failed.");
        setListening(false);
      };
      recorder.onstop = async ()=>{
        const chunks = audioChunksRef.current;
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
        stream.getTracks().forEach(track=>track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;

        if(blob.size===0){
          setLastError("No audio was recorded.");
          setListening(false);
          return;
        }
        await transcribeAudio(blob);
      };

      recorder.start();
      setListening(true);
    }catch(error){
      setListening(false);
      if(error?.name==="NotAllowedError"){
        setLastError("Microphone access was denied. Please allow microphone access for this site.");
      } else if(error?.name==="NotFoundError"){
        setLastError("No microphone was found on this device.");
      } else {
        setLastError(error?.message || "Could not start the microphone.");
      }
    }
  }

  function stopListening(){
    const recorder = mediaRecorderRef.current;
    if(recorder && recorder.state!=="inactive"){
      recorder.stop();
    } else {
      setListening(false);
    }
  }

  async function transcribeAudio(blob){
    setProcessing(true);
    setLastError("");
    try{
      const extension = blob.type.includes("mp4") ? "m4a" : "webm";
      const file = new File([blob], `voice-command.${extension}`, { type: blob.type });
      const formData = new FormData();
      formData.append("audio", file);

      const response = await fetch("/api/transcribe", { method:"POST", body: formData });
      const data = await response.json();
      if(!response.ok) throw new Error(data?.error || "Transcription failed.");

      const text = (data.text||"").trim();
      if(!text){
        setLastError("I couldn't hear any words. Please try again.");
        return;
      }
      setLiveTranscript(text);
      processTranscript(text);
    }catch(error){
      setLastError(error?.message || "Could not transcribe the recording.");
    }finally{
      setProcessing(false);
      setListening(false);
    }
  }

  // One recording can contain several entries ("...done... another
  // line..."), so this splits on those control words and commits each
  // piece separately - same staged-entry behavior as before, just fed from
  // one transcribed block of text instead of a live, continuously-updating
  // stream.
  function processTranscript(text){
    const parts = text.toLowerCase().split(/\b(done|another line)\b/i);
    const spokenEntries = [];
    for(let i=0;i<parts.length;i+=2){
      const entry = parts[i]?.trim();
      // Needs some actual letters/numbers, not just leftover punctuation -
      // a trailing "." after the last "Done." in a transcript otherwise
      // became its own empty staged entry.
      if(entry && entry.replace(/[^a-z0-9]/gi,"").length>2) spokenEntries.push(entry);
    }
    if(spokenEntries.length===0){
      commitEntry(text);
      return;
    }
    spokenEntries.forEach(entry=>commitEntry(entry));
  }

  function commitEntry(transcript){
    const trimmed = transcript.trim();
    if(!trimmed) return;
    const parsed = parseEntry(trimmed, { floors, areaTypes, thickOpts, materials });
    setStaged(p=>[...p, { id: Date.now()+Math.random(), selected:true, ...parsed }]);
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

        {lastError && (
          <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:10,fontSize:12,color:"#991b1b",marginBottom:10}}>
            ⚠️ {lastError}
          </div>
        )}

        <div style={{fontSize:11,color:C.muted,marginBottom:10,lineHeight:1.5}}>
          Press Start, then say: floor → area type → thickness → material (or "combo of X and Y") → "measures of"
          then H×L pairs separated by "<b>plus</b>" → "<b>done</b>" or "<b>another line</b>" between entries →
          press Stop when you're finished.
        </div>

        <div style={{display:"flex",gap:8,marginBottom:10}}>
          {!listening && !processing ? (
            <button onClick={startListening} style={{...BtnD,flex:1}}>🎙️ Let's Start</button>
          ) : listening ? (
            <button onClick={stopListening} style={{...Btn,flex:1,background:"#fef2f2",borderColor:"#fecaca",color:"#991b1b"}}>⏹ Stop</button>
          ) : (
            <button disabled style={{...Btn,flex:1,opacity:0.7}}>⏳ Transcribing…</button>
          )}
        </div>

        {(listening || processing || liveTranscript) && (
          <div style={{
              background: processing ? "#eff6ff" : "#f0fdf4",
              border: processing ? "1px solid #bfdbfe" : "1px solid #86efac",
              borderRadius:8, padding:10, marginBottom:10, fontSize:12,
              color: processing ? "#1d4ed8" : "#166534", minHeight:40}}>
            {processing ? "☁️ Transcribing…" : listening ? "🎙️ Recording…" : liveTranscript}
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
