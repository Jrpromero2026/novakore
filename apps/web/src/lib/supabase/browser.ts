import { createNovaKoreBrowserClient } from "@novakore/database";

/** Browser client — anon key only; used for client-side auth state. */
export const supabaseBrowser = createNovaKoreBrowserClient;
