@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  ================================================================
echo   SECRET AGENT (29/9) - to kleidi Anthropic ston Worker (ANTHROPIC_API_KEY)
echo   Diavazei to secrets\anthropic_api_key.txt. Tipota den emfanizetai stin othoni.
echo  ================================================================
echo.
if not exist "secrets\anthropic_api_key.txt" goto missing
type secrets\anthropic_api_key.txt | npx --yes wrangler secret put ANTHROPIC_API_KEY
if errorlevel 1 goto failed
call npx --yes wrangler secret list > secrets_list_out.txt 2>&1
findstr /c:"ANTHROPIC_API_KEY" secrets_list_out.txt >nul
if errorlevel 1 goto failed
echo.
echo  OK - to kleidi einai sti Cloudflare. Pes "egine" ston Claude.
echo.
pause
exit /b 0
:missing
echo. & echo  ******** LEIPEI secrets\anthropic_api_key.txt - tipota den allaxe. ******** & echo.
pause
exit /b 1
:failed
echo. & echo  ******** APETYXE - des ta minymata pio pano. ******** & echo.
pause
exit /b 1
