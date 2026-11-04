// "Open in Terminal" resumed a saved Claude Code session. Chats are temporary now (nothing is saved), so there is
// nothing to resume. Kept as a 410 so an old open tab gets a clear answer. Delete this folder when convenient.
export function POST() {
  return new Response("Chats are temporary, so there is no saved session to open.", { status: 410 });
}
