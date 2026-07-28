import { createContext, useContext, useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0); // guards against a slower, stale loadCompany call overwriting a newer one

  useEffect(() => {
    // get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadCompany(session.user.id);
      else setLoading(false);
    });

    // listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) { setLoading(true); loadCompany(session.user.id); }
      else { setCompany(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadCompany(userId) {
    const myRequestId = ++requestIdRef.current; // this call's ticket number
    let data = null;
    for (let i = 0; i < 3; i++) {
      // First check if this user owns a company directly
      const owned = await supabase.from("companies")
        .select("*").eq("user_id", userId).maybeSingle();
      if (owned.data) { data = owned.data; break; }
      // Otherwise check if they're an active employee of someone else's company
      const membership = await supabase.from("company_employees")
        .select("company_id").eq("user_id", userId).eq("status","active").maybeSingle();
      if (membership.data?.company_id) {
        const co = await supabase.from("companies")
          .select("*").eq("id", membership.data.company_id).maybeSingle();
        if (co.data) { data = co.data; break; }
      }
      if (i < 2) await new Promise(r => setTimeout(r, 600));
    }
    // If a newer loadCompany call started after this one, ignore this
    // (now-stale) result entirely instead of letting it overwrite the
    // correct, more current state.
    if (myRequestId !== requestIdRef.current) return;
    setCompany(data || null);
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null); setCompany(null);
  }

  return (
    <AuthContext.Provider value={{ user, company, loading, signOut, loadCompany, isOwner: !!(user && company && company.user_id === user.id) }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
