import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
 "https://ackhjqsiwbxupldwjcvj.supabase.co";

const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFja2hqcXNpd2J4dXBsZHdqY3ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MzAxMzAsImV4cCI6MjA5NTAwNjEzMH0.FiT5M0DIBP2GgK2rR-dZviFf9CSkZohyfmY_jirDebs";

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);