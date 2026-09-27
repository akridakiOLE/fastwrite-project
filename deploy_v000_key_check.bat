@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
set /p K=<secrets\km_support_key.txt
set /p O=<secrets\km_support_key_OLD_27-09.txt
curl.exe -s -o nul -w "NEO:%%{http_code}\n" -X POST "https://fastwrite.tech/api/km/support/arrived" -H "Content-Type: application/json" -H "X-Km-Support: %K%" --data "{\"code\":\"KM-E-999999\"}" > "Claude outputs\support\key_check.txt"
curl.exe -s -o nul -w "PALIO:%%{http_code}\n" -X POST "https://fastwrite.tech/api/km/support/arrived" -H "Content-Type: application/json" -H "X-Km-Support: %O%" --data "{\"code\":\"KM-E-999999\"}" >> "Claude outputs\support\key_check.txt"
set K=
set O=
exit /b 0
