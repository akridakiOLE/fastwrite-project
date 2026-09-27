@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo  LEADS: anafora apostolis dianomi-1 (MONO anagnosi)
call npx --yes wrangler d1 execute fastwrite-beta-downloads --remote --json --command "SELECT s.email, s.at, s.ok, s.err, s.msg_id, l.unsub_at, l.stay_at FROM km_lead_sends s JOIN km_leads l ON l.email = s.email WHERE s.campaign = 'dianomi-1' ORDER BY s.at" > "Claude outputs\dianomi\report_dianomi1.json"
exit /b %errorlevel%
