// Supabase connection config
// Note: the anon/public key is safe to expose client-side by design.
// Actual data protection is enforced via Row Level Security (RLS) policies
// on the categories and expenses tables, not by hiding this key.

const SUPABASE_URL = "https://zprdgxnlzutklhjfhvcc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwcmRneG5senV0a2xoamZodmNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MDQ5MzgsImV4cCI6MjEwMDk4MDkzOH0.5rK8Te-5XGzu7sqWNbOHi_O8JkpTjxiuCEGq5yskQIk";
