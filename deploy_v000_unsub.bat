@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
call npx --yes wrangler d1 execute fastwrite-beta-downloads --remote --json --command "SELECT email, name, unsub_at, consent_at FROM km_leads WHERE unsub_at IS NOT NULL" > "Claude outputs\dianomi\unsub.json"
exit /b 0
