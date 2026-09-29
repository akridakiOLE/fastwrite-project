@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  ================================================================
echo   SECRETS OAUTH (29/9) - Google + Microsoft client secrets ston Worker
echo   Diavazei ta secrets\google_oauth_secret.txt kai secrets\microsoft_oauth_secret.txt
echo   Tipota den emfanizetai stin othoni.
echo  ================================================================
echo.
if not exist "secrets\google_oauth_secret.txt" goto missing
if not exist "secrets\microsoft_oauth_secret.txt" goto missing
echo [1/2] GOOGLE_CLIENT_SECRET...
type secrets\google_oauth_secret.txt | npx --yes wrangler secret put GOOGLE_CLIENT_SECRET
if errorlevel 1 goto failed
echo [2/2] MS_CLIENT_SECRET...
type secrets\microsoft_oauth_secret.txt | npx --yes wrangler secret put MS_CLIENT_SECRET
if errorlevel 1 goto failed
echo.
echo  Elegxos - onomata mono, pote times:
call npx --yes wrangler secret list > secrets_list_out.txt 2>&1
findstr /c:"GOOGLE_CLIENT_SECRET" secrets_list_out.txt >nul
if errorlevel 1 goto failed
findstr /c:"MS_CLIENT_SECRET" secrets_list_out.txt >nul
if errorlevel 1 goto failed
echo.
echo  ================================================================
echo   OK - kai ta dyo secrets einai sti Cloudflare. Pes "egine" ston Claude.
echo  ================================================================
echo.
pause
exit /b 0
:missing
echo.
echo  ******** LEIPEI ARXEIO STO secrets\ - tipota den allaxe. ********
echo.
pause
exit /b 1
:failed
echo.
echo  ******** APETYXE - des ta minymata pio pano. ********
echo.
pause
exit /b 1
