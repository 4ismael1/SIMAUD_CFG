import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables:');
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? '✓ Set' : '❌ Missing');
  console.error('VITE_SUPABASE_ANON_KEY:', supabaseKey ? '✓ Set' : '❌ Missing');
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

console.log('✅ Supabase client initialized');
console.log('URL:', supabaseUrl);

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'simaud-auth'
  }
});

// Types for our database
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone: string;
  cedula: string;
  role: 'admin' | 'supervisor' | 'gestor' | 'user';
  created_at: string;
  updated_at: string;
}
