@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo  LEADS: eisagogi CSV 27/9 (93 grammes, oi 89 palioi prospernontai) + dry run (27/9)
set /p K=<secrets\km_admin_key.txt
set D=Claude outputs\dianomi
curl.exe -s -X POST "https://fastwrite.tech/api/km/admin/leads/import" -H "Content-Type: application/json" -H "X-Km-Admin: %K%" --data-binary "@%D%\leads_import_27-09.json" > "%D%\out_import_27-09.json"
curl.exe -s -X POST "https://fastwrite.tech/api/km/admin/leads/send" -H "Content-Type: application/json" -H "X-Km-Admin: %K%" --data-binary "@%D%\send_dry.json" > "%D%\out_send_dry_27-09.json"
set RC=%errorlevel%
set K=
exit /b %RC%
