@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  ELEGXOS KLEIDIOY ANTHROPIC - lista montelon, DEN xreonei tipota
echo.
set /p K=<secrets\anthropic_api_key.txt
curl.exe -s -o anthropic_check_out.json -w "HTTP %%{http_code}" https://api.anthropic.com/v1/models -H "x-api-key: %K%" -H "anthropic-version: 2023-06-01"
set K=
echo.
echo.
echo  Egine. Pes "egine" ston Claude.
pause
