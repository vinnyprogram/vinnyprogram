import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    // get initial session
    supabase.auth.getSession().then(({ data:{ session } })=>{
      setUser(session?.user ?? null);
      if(session?.user) loadCompany(session.user.id);
      else setLoading(false);
    });

    // listen for auth changes
    const { data:{ subscription } } = supabase.auth.onAuthStateChange((_event, session)=>{
      setUser(session?.user ?? null);
      if(session?.user) loadCompany(session.user.id);
      else { setCompany(null); setLoading(false); }
    });

    return ()=>subscription.unsubscribe();
  },[]);

  async function loadCompany(userId) {
    const { data } = await supabase.from("companies")
      .select("*").eq("user_id", userId).single();
    setCompany(data||null);
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null); setCompany(null);
  }

  return (
    <AuthContext.Provider value={{ user, company, loading, signOut, loadCompany }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
