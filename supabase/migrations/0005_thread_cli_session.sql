-- The Claude Code session behind a chat, so the next message (and "Open in Terminal") resumes it.
alter table public.chat_threads add column if not exists cli_session_id text;
grant update (cli_session_id) on public.chat_threads to authenticated;
