@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d C:\Users\User\fastwrite-project
echo.
echo  v135 = evrimata Stavros sto build 4: xoris othoni kleidiou Gemini, skouro fonto, poster kameras, "diavastikan apo"
echo         Ston browser: idia ektos apo tin othoni kleidiou (apofasi 15/10 + 18/10).
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/7] Syntaxi...
node --check site\kostometro\app.js
if errorlevel 1 goto failed
node --check site\kostometro\sw.js
if errorlevel 1 goto failed
echo    OK

echo [2/7] v135 tests + metallaxeis 1-6...
node tests\v135.test.mjs
if errorlevel 1 goto tf
for /L %%N in (1,1,6) do (
  node tests\v135.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
echo    OK

echo [3/7] Palia tests (v133, legal_v21, v87, k3b, k3a, h11b, v88-v131, pinakas, ref, verify, install_ui, ref_ui, v89)...
for %%T in (v134 v133 legal_v21 v87 v86 pinakas_ui k3b k3a h11b v88 v92 v93 v95 v98 v99 v100 v102 v105 v106 v112 v113 v114 v116 v118 v120 v131 pinakas ref verify install_ui ref_ui v89) do (
  node --experimental-sqlite tests\%%T.test.mjs >nul 2>&1
  if errorlevel 1 ( echo    APETYXE: %%T & goto tf )
)
echo    OK

echo [4/7] git add (RITI lista) + commit + push...
git add site\kostometro\app.js site\kostometro\index.html site\kostometro\sw.js site\kostometro\version.json tests\v135.test.mjs tests\v134.test.mjs tests\v86.test.mjs deploy_v135.bat commit_v135.txt
if errorlevel 1 goto failed
git commit -F commit_v135.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo    OK

echo [5/7] wrangler deploy...
call npx --yes wrangler deploy
if errorlevel 1 goto failed
echo    OK

echo [6/7] Epalithefsi stin paragogi...
timeout /t 8 /nobreak >nul
curl.exe -s "https://fastwrite.tech/kostometro/version.json?nc=%RANDOM%" > "%TEMP%\v135_ver.txt"
findstr /c:"v135" "%TEMP%\v135_ver.txt" >nul
if errorlevel 1 goto vf
curl.exe -s "https://fastwrite.tech/kostometro/app.js?nc=%RANDOM%" > "%TEMP%\v135_app.txt"
findstr /c:"KM-V135-READBY" "%TEMP%\v135_app.txt" >nul
if errorlevel 1 goto vf
curl.exe -s -o NUL -w "%%{http_code}" "https://fastwrite.tech/kostometro/?nc=%RANDOM%" > "%TEMP%\v135_idx.txt"
findstr /c:"200" "%TEMP%\v135_idx.txt" >nul
if errorlevel 1 goto vf
echo    OK - version v135 · READBY zontano · /kostometro/ 200

echo [7/7] Efarmogi katastimaton: www = v135 (antigrafa tou site, XORIS sw.js) + riza index.html...
set SITE=C:\Users\User\fastwrite-project\site
cd /d C:\Users\User\kostometro-app
if exist ".git\index.lock" del /f /q ".git\index.lock"
for %%f in (app.js index.html app.css qr.js qrscan.js version.json manifest.webmanifest) do copy /y "%SITE%\kostometro\%%f" www\kostometro\%%f >nul
copy /y "%SITE%\km-crypto.js" www\km-crypto.js >nul
copy /y "%SITE%\kostometro\icons\*.png" www\kostometro\icons\ >nul
if exist www\kostometro\sw.js goto swf
for %%f in (app.js index.html version.json) do (
  fc /b "%SITE%\kostometro\%%f" www\kostometro\%%f >nul
  if errorlevel 1 ( echo    DIAFORA: %%f & goto failed2 )
)
findstr /c:"v135" www\kostometro\version.json >nul
if errorlevel 1 goto failed2
findstr /c:"/kostometro/index.html" www\index.html >nul
if errorlevel 1 goto failed2
git add www\index.html www\kostometro\app.js www\kostometro\index.html www\kostometro\app.css www\kostometro\qr.js www\kostometro\qrscan.js www\kostometro\version.json www\kostometro\manifest.webmanifest www\km-crypto.js www\kostometro\icons
if errorlevel 1 goto failed2
git commit -m "www = v135 (xoris othoni kleidiou, poster kameras, diavastikan apo, skouro html) - antigrafo tou site"
if errorlevel 1 goto failed2
git push origin main
if errorlevel 1 goto failed2
echo    OK

echo.
echo ================================
echo   OK - v135 ZONTANO + www v135 sto GitHub
echo   EPOMENO: deploy_v016_aab_v135.bat (kostometro-app)
echo ================================
exit /b 0

:tf
echo. & echo  ******** TESTS FAILED - tipota den anevike. ******** & echo.
exit /b 1
:mf
echo. & echo  ******** APODEIXI METALLAXIS APETYXE - tipota den anevike. ******** & echo.
exit /b 1
:vf
echo. & echo  ******** TO DEPLOY EGINE, ALLA I EPALITHEFSI APETYXE - deite %TEMP%\v135_*.txt ******** & echo.
exit /b 2
:swf
echo. & echo  ******** www\kostometro\sw.js DEN PREPEI NA YPARXEI ******** & echo.
exit /b 1
:failed2
echo. & echo  ******** O SERVER ANEVIKE OK, ALLA TO kostometro-app (www) DEN ANEVIKE. ******** & echo.
exit /b 1
:failed
echo. & echo  ******** APETYXE. ******** & echo.
exit /b 1
