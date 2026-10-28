// HomeKeeper cloud settings (sign-in and backup).
// These are the public values of the shared Supabase project (also used by Let's Go).
// They are safe to publish: the database rules in supabase/homekeeper.sql decide who
// can read each home. Leave url empty to turn sign-in off.
export const CLOUD = {
  url: 'https://czpdjnhzltsskwloojdw.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6cGRqbmh6bHRzc2t3bG9vamR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNzY1ODAsImV4cCI6MjEwODc1MjU4MH0.cxFI-ALxjcHYTk1ou9aCsUZA1z0mLk5u-5o8RWGUS4o',
};
