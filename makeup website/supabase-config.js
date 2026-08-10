/* =========================================================
   VELOUR — Supabase connection
   Fill these two values in from your Supabase project:
   Dashboard → Project Settings → API
   - "Project URL"      → SUPABASE_URL
   - "anon public" key  → SUPABASE_ANON_KEY
   The anon key is safe to expose in frontend code — it's
   designed for this. Row Level Security (set up in
   supabase-schema.sql) is what actually protects the data,
   not secrecy of this key.
   ========================================================= */

const SUPABASE_URL = "https://lbnvoskirzrwsoibnqea.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Riy737YfYT4uPEhhoXCnjg_SSgxNjBY";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
