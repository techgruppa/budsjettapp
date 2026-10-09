import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabasePublishableKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigError =
  Boolean(supabaseUrl) !== Boolean(supabasePublishableKey)
    ? "Both REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_PUBLISHABLE_KEY must be configured."
    : "";

export const supabase =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey)
    : null;
