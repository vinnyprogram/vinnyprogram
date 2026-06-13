import { useState, useEffect, useRef } from "react";

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_PLACES_KEY;

// Load Google Maps script once
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
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const serviceRef = useRef(null);
  const sessionRef = useRef(null);

  useEffect(()=>{
    if(!GOOGLE_KEY) return;
    loadGoogleMaps(()=>{
      if(!window.google?.maps?.places) return;
      serviceRef.current = new window.google.maps.places.AutocompleteService();
      sessionRef.current = new window.google.maps.places.AutocompleteSessionToken();
    });
  },[]);

  function fetchSuggestions(input) {
    if(!input || input.length < 3 || !serviceRef.current){ setSuggestions([]); return; }
    serviceRef.current.getPlacePredictions({
      input,
      sessionToken: sessionRef.current,
      componentRestrictions: { country: "us" },
      types: ["address"],
    }, (predictions, status)=>{
      if(status === window.google.maps.places.PlacesServiceStatus.OK && predictions){
        setSuggestions(predictions.slice(0,5));
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
      }
    });
  }

  function selectSuggestion(prediction) {
    onChange(prediction.description);
    setSuggestions([]);
    setShowSuggestions(false);
    // reset session token after selection
    if(window.google?.maps?.places){
      sessionRef.current = new window.google.maps.places.AutocompleteSessionToken();
    }
  }

  // If no API key, render plain input
  if(!GOOGLE_KEY){
    return <input style={style} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)} />;
  }

  return (
    <div style={{ position:"relative", width:"100%" }}>
      <input
        ref={inputRef}
        style={style}
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
      {showSuggestions && suggestions.length > 0 && (
        <div style={{
          position:"absolute", top:"100%", left:0, right:0, zIndex:999,
          background:"white", border:"1px solid #e2e8f0", borderRadius:8,
          boxShadow:"0 4px 16px rgba(0,0,0,.12)", marginTop:2, overflow:"hidden",
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
        </div>
      )}
    </div>
  );
}
