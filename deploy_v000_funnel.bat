@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
call npx --yes wrangler d1 execute fastwrite-beta-downloads --remote --json --command "SELECT source, COUNT(*) n, MIN(created_at) first, MAX(created_at) last FROM km_accounts WHERE created_at >= '2026-09-27T00:00:00Z' GROUP BY source" > "Claude outputs\dianomi\funnel_1.json"
call npx --yes wrangler d1 execute fastwrite-beta-downloads --remote --json --command "SELECT COUNT(*) total, SUM(CASE WHEN unsub_at IS NOT NULL THEN 1 ELSE 0 END) unsub, SUM(CASE WHEN stay_at IS NOT NULL THEN 1 ELSE 0 END) stay FROM km_leads" > "Claude outputs\dianomi\funnel_2.json"
call npx --yes wrangler d1 execute fastwrite-beta-downloads --remote --json --command "SELECT COUNT(*) n FROM km_accounts WHERE deleted IS NULL" > "Claude outputs\dianomi\funnel_3.json"
exit /b 0
