// Supabase Configuration
// Note: These are safe to expose in frontend code (anon key only has limited permissions)

const SUPABASE_CONFIG = {
  url: 'https://lpxtkltwggmkymkujzbk.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxweHRrbHR3Z2dta3lta3VqemJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1Mjc1NzcsImV4cCI6MjA3ODEwMzU3N30.yZDsTpwByoNX0s45MhPVeWXHytgCzJQ56vpbIT5TRyE'
};

// Initialize Supabase client (will be loaded after supabase-js library)
let supabaseClient = null;

function initSupabase() {
  if (typeof supabase === 'undefined') {
    console.error('Supabase library not loaded. Include the CDN script in your HTML.');
    return null;
  }
  
  supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  console.log('✅ Supabase client initialized');
  return supabaseClient;
}

// Export for use in other files
window.SupabaseConfig = SUPABASE_CONFIG;
window.initSupabase = initSupabase;
window.getSupabaseClient = () => supabaseClient;
