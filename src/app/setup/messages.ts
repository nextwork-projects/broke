// "Connect Supabase" results, keyed by the code its callback sends back.
export const DB_MESSAGES: Record<string, string> = {
  cancelled: "Supabase sign-in was cancelled.",
  elsewhere: "This sign-in didn't start on this computer. Press Connect Supabase again.",
  rejected: "Supabase didn't accept the sign-in. Press Connect Supabase again.",
  "update-failed": "Connected, but a database update failed. Press Update database below to see why.",
  updated: "Connected. Tables updated.",
  current: "Connected. Tables are up to date.",
  filled: "Connected. broke filled in your project's address and public key and created its tables. One key left to paste.",
  "filled-no-tables": "Connected and filled in. Creating the tables didn't finish: press Update database under step 2.",
  pick: "Connected. Pick the project broke should use.",
  "no-project": "Connected. This account has no projects yet: make one below.",
};
