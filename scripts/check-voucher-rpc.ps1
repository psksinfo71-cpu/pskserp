$ErrorActionPreference = 'Stop'
Write-Host 'Checking local Supabase prerequisites...'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is not installed or not on PATH. Install/start Docker Desktop first.' }
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { throw 'Node.js/npm is required.' }
Write-Host 'Starting local Supabase...'
npx supabase start
Write-Host 'Applying migrations from scratch...'
npx supabase db reset --yes
Write-Host 'Checking generate_voucher_no overloads...'
npx supabase db execute --file scripts/check-voucher-rpc.sql --local
Write-Host 'Local voucher RPC verification completed successfully.'
