// "Connect Supabase" results, keyed by the code its callback sends back.
export const DB_MESSAGES: Record<string, string> = {
  cancelled: "Supabase sign-in was cancelled.",
  elsewhere: "This sign-in didn't start on this computer. Press Connect Supabase again.",
  rejected: "Supabase didn't accept the sign-in. Press Connect Supabase again.",
  "update-failed": "Connected, but a database update failed. Press Update database below to see why.",
  updated: "Connected. Tables updated.",
  current: "Connected. Tables are up to date.",
};
