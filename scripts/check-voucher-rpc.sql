-- Run with Supabase SQL editor or: supabase db execute --file scripts/check-voucher-rpc.sql
-- Confirms the exact RPC overload exposed to PostgREST and removes stale 5-argument overloads.
SELECT n.nspname AS schema_name, p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'generate_voucher_no'
ORDER BY arguments;

DROP FUNCTION IF EXISTS public.generate_voucher_no(text, uuid, uuid, text, date);
NOTIFY pgrst, 'reload schema';

SELECT n.nspname AS schema_name, p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'generate_voucher_no'
ORDER BY arguments;
