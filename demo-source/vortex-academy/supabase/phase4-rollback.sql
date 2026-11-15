-- =====================================================================
-- Vortex Academy: Rollback of Phase 4 (Support Chat)
--
-- Drops ONLY the functions, policies, indexes, and tables created in
-- supabase/phase4-support-chat.sql. Leaves all Phases 1-3 objects intact.
-- WARNING: this deletes all support chat threads, messages and aliases.
-- =====================================================================

-- 1. Drop Phase 4 RPC functions
drop function if exists public.support_delete_thread(uuid);
drop function if exists public.support_unread_total();
drop function if exists public.support_close_thread(uuid, boolean);
drop function if exists public.support_thread_messages(uuid, timestamptz);
drop function if exists public.support_admin_threads();
drop function if exists public.support_my_threads();
drop function if exists public.support_start_thread(uuid, boolean, text, uuid, text);
drop function if exists public.support_send_message(uuid, text);
drop function if exists public.support_list_contacts();

-- 2. Drop Phase 4 internal helper functions
drop function if exists public.support_ensure_admin_alias(uuid);
drop function if exists public.support_is_eligible_admin(text, smallint, uuid);

-- 3. Drop Phase 4 RLS policies
drop policy if exists "Super admin views support_messages" on public.support_messages;
drop policy if exists "Super admin views support_threads" on public.support_threads;
drop policy if exists "Super admin views admin_aliases" on public.admin_aliases;

-- 4. Drop Phase 4 tables (indexes and constraints are dropped automatically)
drop table if exists public.support_messages;
drop table if exists public.support_threads;
drop table if exists public.admin_aliases;

-- 5. Verify (read-only): expect 0 rows for both queries
-- select table_name
-- from information_schema.tables
-- where table_schema = 'public'
--   and table_name in ('admin_aliases', 'support_threads', 'support_messages');
--
-- select proname
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and proname like 'support_%';
