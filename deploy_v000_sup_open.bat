@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo  ANAGNOSI MONO - anoixta aitimata ypostirixis. KAMIA allagi, kanena push.
call npx --yes wrangler d1 execute fastwrite-beta-downloads --remote --json --command "SELECT code, scope, status, created_at, last_in_at, last_out_at, closed_at FROM km_support_cases WHERE status <> 'closed' ORDER BY created_at" > "Claude outputs\pinakas\sup_open.json" 2>&1
set RC=%errorlevel%
echo  exit=%RC%
exit /b %RC%
