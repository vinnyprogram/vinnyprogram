import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_PLACES_KEY;

// Load Google Maps script once (shared singleton across the whole app)
let scriptLoaded = false;
let scriptLoading = false;
const callbacks = [];

function loadGoogleMaps(cb) {
  if(scriptLoaded){ cb(); return; }
  callbacks.push(cb);
  if(scriptLoading) return;
  scriptLoading = true;
  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&libraries=places`;
  script.async = true;
  script.onload = ()=>{
    scriptLoaded = true;
    callbacks.forEach(fn=>fn());
    callbacks.length = 0;
  };
  document.head.appendChild(script);
}

export default function AddressInput({ value, onChange, placeholder, style }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top:0, left:0, width:0 });
  const sessionRef = useRef(null);
  const inputRef   = useRef(null);

  useEffect(()=>{
    if(!GOOGLE_KEY) return;
    loadGoogleMaps(()=>{
      if(!window.google?.maps?.places) return;
      sessionRef.current = new window.google.maps.places.AutocompleteSessionToken();
    });
  },[]);

  // Recompute dropdown position whenever it should show
  useEffect(()=>{
    if(!showSuggestions || !inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownPos({
      top:  rect.bottom + window.scrollY + 2,
      left: rect.left   + window.scrollX,
      width: rect.width,
    });
  },[showSuggestions, suggestions]);

  async function fetchSuggestions(input) {
    if(!input || input.length < 3 || !window.google?.maps?.places){ setSuggestions([]); return; }
    try {
      const { AutocompleteSuggestion } = window.google.maps.places;
      const request = {
        input,
        sessionToken: sessionRef.current,
        includedRegionCodes: ["us"],
        includedPrimaryTypes: ["street_address"],
      };
      const { suggestions: results } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
      const preds = (results||[]).slice(0,5).map(s=>({
        place_id: s.placePrediction?.placeId || Math.random(),
        description: s.placePrediction?.text?.text || "",
        structured_formatting: {
          main_text: s.placePrediction?.mainText?.text || "",
          secondary_text: s.placePrediction?.secondaryText?.text || "",
        },
      }));
      setSuggestions(preds);
      setShowSuggestions(preds.length > 0);
    } catch(e) {
      console.error("autocomplete error:", e);
      setSuggestions([]);
    }
  }

  function selectSuggestion(prediction) {
    onChange(prediction.description);
    setSuggestions([]);
    setShowSuggestions(false);
    if(window.google?.maps?.places){
      sessionRef.current = new window.google.maps.places.AutocompleteSessionToken();
    }
  }

  // If no API key, render plain input
  if(!GOOGLE_KEY){
    return <input style={style} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)} />;
  }

  const dropdown = showSuggestions && suggestions.length > 0 && createPortal(
    <div style={{
      position:"absolute",
      top: dropdownPos.top,
      left: dropdownPos.left,
      width: dropdownPos.width,
      zIndex: 99999,
      background:"white",
      border:"1px solid #e2e8f0",
      borderRadius:8,
      boxShadow:"0 8px 24px rgba(0,0,0,.15)",
      overflow:"hidden",
    }}>
      {suggestions.map((s,i)=>(
        <div key={s.place_id} onMouseDown={()=>selectSuggestion(s)}
          style={{
            padding:"10px 12px", cursor:"pointer", fontSize:13,
            borderBottom: i<suggestions.length-1?"1px solid #f1f5f9":"none",
            background:"white", display:"flex", alignItems:"flex-start", gap:8,
          }}
          onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
          onMouseLeave={e=>e.currentTarget.style.background="white"}
        >
          <span style={{fontSize:14, marginTop:1, flexShrink:0}}>📍</span>
          <div>
            <div style={{fontWeight:600, color:"#0f172a", lineHeight:1.4}}>
              {s.structured_formatting?.main_text || s.description}
            </div>
            <div style={{fontSize:11, color:"#64748b", lineHeight:1.4}}>
              {s.structured_formatting?.secondary_text || ""}
            </div>
          </div>
        </div>
      ))}
      <div style={{padding:"6px 12px", fontSize:10, color:"#94a3b8",
          textAlign:"right", background:"#fafbfc"}}>
        Powered by Google
      </div>
    </div>,
    document.body
  );

  return (
    <div style={{ position:"relative", flex: style?.flex||undefined, width: style?.width||undefined }}>
      <input
        ref={inputRef}
        style={{...style, width:"100%", flex:undefined}}
        placeholder={placeholder}
        value={value}
        onChange={e=>{
          onChange(e.target.value);
          fetchSuggestions(e.target.value);
        }}
        onFocus={()=>{ if(suggestions.length>0) setShowSuggestions(true); }}
        onBlur={()=>setTimeout(()=>setShowSuggestions(false), 150)}
        autoComplete="off"
      />
      {dropdown}
    </div>
  );
}
