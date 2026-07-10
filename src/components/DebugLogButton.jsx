import { useState } from "react";
import { getDebugLog, clearDebugLog } from "../utils/debugLog";

// Drop <DebugLogButton/> anywhere in a page's header. It manages its own
// open/closed state and always reads the shared, cross-page log fresh
// from localStorage when opened.
export default function DebugLogButton({ style }){
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState([]);

  function show(){
    setLog(getDebugLog());
    setOpen(true);
  }

  return (
    <>
      <button onClick={show} title="View activity log - useful for troubleshooting"
        style={{border:"1px solid #cbd5e1",background:"#fff",color:"#64748b",cursor:"pointer",
          fontSize:16,padding:"5px 8px",borderRadius:8,flexShrink:0,...style}}>
        🐛
      </button>

      {open && (
        <div onClick={()=>setOpen(false)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,
            display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:"#0f172a",color:"#e2e8f0",width:"100%",maxWidth:600,
              maxHeight:"70vh",borderRadius:"16px 16px 0 0",display:"flex",flexDirection:"column",
              fontFamily:"ui-monospace,monospace"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"12px 16px",borderBottom:"1px solid #334155"}}>
              <span style={{fontWeight:700,fontSize:14}}>🐛 Activity Log <span style={{color:"#64748b",fontWeight:400}}>(all pages)</span></span>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{
                    const text=log.map(l=>`[${l.t}]${l.page?` [${l.page}]`:""} ${l.msg}`).join("\n");
                    navigator.clipboard?.writeText(text);
                    alert("Copied - paste it in chat");
                  }}
                  style={{border:"1px solid #475569",background:"none",color:"#94a3b8",
                    cursor:"pointer",fontSize:11,padding:"4px 10px",borderRadius:6}}>
                  Copy
                </button>
                <button onClick={()=>{ if(window.confirm("Clear the whole activity log? This can't be undone.")){ clearDebugLog(); setLog([]); } }}
                  style={{border:"1px solid #475569",background:"none",color:"#94a3b8",
                    cursor:"pointer",fontSize:11,padding:"4px 10px",borderRadius:6}}>
                  Clear
                </button>
                <button onClick={()=>setOpen(false)}
                  style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:18}}>
                  ✕
                </button>
              </div>
            </div>
            <div style={{overflowY:"auto",padding:"12px 16px",fontSize:11,lineHeight:1.7}}>
              {log.length===0 && <div style={{color:"#64748b"}}>Nothing logged yet.</div>}
              {log.slice().reverse().map((l,i)=>(
                <div key={i} style={{marginBottom:2}}>
                  <span style={{color:"#64748b"}}>[{l.t}]</span>
                  {l.page && <span style={{color:"#38bdf8"}}> [{l.page}]</span>} {l.msg}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
