@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  OROI §17 = T.TH. 27452, 1645 Lefkosia (afairesi dieythynsis katoikias). Mono site\legal\terms.html.
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/4] Elegxos arxeiou...
findstr /i /c:"Derven" site\legal\terms.html >nul
if not errorlevel 1 goto tf
findstr /c:"P.O. Box 27452, 1645 Nicosia" site\legal\terms.html >nul
if errorlevel 1 goto tf
echo    OK

echo [2/4] git add (RITI lista) + commit + push...
git add site\legal\terms.html deploy_v136b_oroi.bat commit_oroi_thyrida.txt
if errorlevel 1 goto failed
git commit -F commit_oroi_thyrida.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo    OK

echo [3/4] wrangler deploy...
call npx --yes wrangler deploy
if errorlevel 1 goto failed
echo    OK

echo [4/4] Epalithefsi stin paragogi...
timeout /t 8 /nobreak >nul
curl.exe -s "https://fastwrite.tech/legal/terms?nc=%RANDOM%" > "%TEMP%\oroi.txt"
findstr /c:"P.O. Box 27452, 1645 Nicosia" "%TEMP%\oroi.txt" >nul
if errorlevel 1 goto vf
findstr /i /c:"Derven" "%TEMP%\oroi.txt" >nul
if not errorlevel 1 goto vf
curl.exe -s "https://fastwrite.tech/kostometro/version.json?nc=%RANDOM%" > "%TEMP%\oroi_ver.txt"
findstr /c:"v136" "%TEMP%\oroi_ver.txt" >nul
if errorlevel 1 goto vf
echo    OK - Oroi me 27452 · kamia Derveneion · efarmogi akoma v136

echo.
echo ================================
echo   OK - OROI DIORTHOMENOI ZONTANA
echo ================================
exit /b 0

:tf
echo. & echo  ******** ELEGXOS APETYXE - tipota den anevike. ******** & echo.
exit /b 1
:vf
echo. & echo  ******** TO DEPLOY EGINE, ALLA I EPALITHEFSI APETYXE - deite %TEMP%\oroi*.txt ******** & echo.
exit /b 2
:failed
echo. & echo  ******** APETYXE. ******** & echo.
exit /b 1
