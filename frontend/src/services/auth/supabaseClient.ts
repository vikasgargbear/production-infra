import { createClient, SupabaseClient } from '@supabase/supabase-js';


let client: SupabaseClient | null = null;


export function isSupabaseAuthConfigured(): boolean {
    return Boolean(
        process.env.REACT_APP_SUPABASE_URL?.trim() &&
        process.env.REACT_APP_SUPABASE_ANON_KEY?.trim()
    );
}


export function getSupabaseClient(): SupabaseClient {
    if (client) {
        return client;
    }

    const url = process.env.REACT_APP_SUPABASE_URL?.trim();
    const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY?.trim();
    if (!url || !anonKey) {
        throw new Error('Supabase authentication is not configured');
    }

    client = createClient(url, anonKey, {
        auth: {
            autoRefreshToken: true,
            detectSessionInUrl: true,
            persistSession: true,
            flowType: 'pkce',
        },
    });
    return client;
}
