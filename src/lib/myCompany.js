import { supabase } from "./supabase";

/**
 * Finds the company the logged-in user works for:
 *  1) a company they own, else
 *  2) the company they are an ACTIVE employee of.
 * Returns { data: { id } | null } so it can replace the old
 *   supabase.from("companies").select("id").eq("user_id", ...).maybeSingle()
 * calls, which only ever found OWNERS (employees got no company).
 */
export async function getMyCompany(userId) {
  if (!userId) return { data: null };
  const owned = await supabase.from("companies").select("id").eq("user_id", userId).maybeSingle();
  if (owned.data) return { data: owned.data };
  const m = await supabase.from("company_employees").select("company_id")
    .eq("user_id", userId).eq("status", "active").maybeSingle();
  if (m.data?.company_id) return { data: { id: m.data.company_id } };
  return { data: null };
}
