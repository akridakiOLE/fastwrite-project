@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  v99 = VOITHOS KOSTOMETRO (KM-AGENT) - Fasi 1, KRYFOS (mono me ?chat=1)
echo.
echo        Metavasi vasis: schema\km_agent.sql (CREATE IF NOT EXISTS, 3 neoi pinakes).
echo        Mystiko: ANTHROPIC_API_KEY PREPEI na yparxei (SECRETS_AGENT.bat).
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [0/7] Gnosi tou voithou apo tis piges tis efarmogis...
python tools\agent\build_knowledge.py
if errorlevel 1 echo    (python den trexei - xrisimopoieitai i etoimi gnosi)

echo [1/7] Deiktes pou PREPEI na yparxoun...
findstr /c:"KM-AGENT" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-SERVER-V99-AGENT" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"if (agentHasSecret(text)) return json" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"replyTo: MAIL_SUPPORT" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"kmAgentPrune" src\worker.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-AGENT" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"var AG_PUBLIC = false;" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"data-agent=\"fab\"" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"data-agent=\"consent\"" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"KM-AGENT" site\kostometro\app.css >nul
if errorlevel 1 goto nm
findstr /c:"km-v99" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
findstr /c:"\"v\": \"v99\"" site\kostometro\version.json >nul
if errorlevel 1 goto nm
findstr /c:"CREATE TABLE IF NOT EXISTS km_agent_sessions" schema\km_agent.sql >nul
if errorlevel 1 goto nm
findstr /c:"KM-OAUTH" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"GOOGLE_CLIENT_ID" wrangler.toml >nul
if errorlevel 1 goto nm
findstr /c:"aistudio.google.com/apikey" site\kostometro\agent\knowledge_el.md >nul
if errorlevel 1 goto nm
echo    OK

echo [2/7] Deiktes pou PREPEI na leipoun...
findstr /c:"km-v98" site\kostometro\sw.js >nul
if not errorlevel 1 goto lo
findstr /c:"var AG_PUBLIC = true" site\kostometro\app.js >nul
if not errorlevel 1 goto lo
findstr /c:"sk-ant-api03" src\km.js >nul
if not errorlevel 1 goto lo
findstr /c:"sk-ant-api03" site\kostometro\app.js >nul
if not errorlevel 1 goto lo
findstr /c:"sk-ant-api03" site\kostometro\agent\knowledge_el.md >nul
if not errorlevel 1 goto lo
findstr /c:"GOCSPX" src\km.js >nul
if not errorlevel 1 goto lo
findstr /c:"ANTHROPIC_API_KEY =" wrangler.toml >nul
if not errorlevel 1 goto lo
echo    OK

echo [3/7] Syntaxi...
node --check src\km.js
if errorlevel 1 goto failed
node --check src\worker.js
if errorlevel 1 goto failed
node --check site\kostometro\app.js
if errorlevel 1 goto failed
node --check site\kostometro\sw.js
if errorlevel 1 goto failed
echo    OK

echo [4/7] Souites + apodeixeis metallaxis...
node --experimental-sqlite tests\v99.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12) do (
  node --experimental-sqlite tests\v99.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\v98.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12) do (
  node --experimental-sqlite tests\v98.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%T in (v97 v95 v94 v93 v92 v88 verify ref pinakas h11b mail cleanup feedback leads) do (
  node --experimental-sqlite tests\%%T.test.mjs
  if errorlevel 1 goto tf
)
for %%T in (v95_ui gs95 v89 v87 v86 v85 verify_ui ai78 ref_ui pinakas_ui install_ui) do (
  node tests\%%T.test.mjs
  if errorlevel 1 goto tf
)
echo    OK

echo [5/7] Mystiko sti Cloudflare (onoma mono)...
call npx --yes wrangler secret list > secrets_list_out.txt 2>&1
findstr /c:"ANTHROPIC_API_KEY" secrets_list_out.txt >nul
if errorlevel 1 goto ns
echo    OK

echo [6/7] Metavasi vasis PRIN to deploy...
call npx --yes wrangler d1 execute fastwrite-beta-downloads --remote --file schema\km_agent.sql
if errorlevel 1 goto failed
echo    OK

echo [7/7] Staging kai push...
git add site\kostometro\app.js site\kostometro\index.html site\kostometro\app.css site\kostometro\sw.js site\kostometro\version.json site\kostometro\agent\knowledge_el.md
if errorlevel 1 goto failed
git add src\km.js src\worker.js schema\km_agent.sql tests\v99.test.mjs tools\agent\flow_el.md tools\agent\build_knowledge.py tools\agent\smoke.mjs
if errorlevel 1 goto failed
git add deploy_v99.bat commit_v99.txt SECRETS_AGENT.bat deploy_v000_agent_smoke.bat
if errorlevel 1 goto failed
git commit -F commit_v99.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo ================================
echo.
pause
exit /b 0

:tf
echo. & echo  ******** TESTS FAILED - tipota den anevike. ******** & echo.
pause
exit /b 1
:mf
echo. & echo  ******** APODEIXI METALLAXIS APETYXE. ******** & echo.
pause
exit /b 1
:ns
echo. & echo  ******** LEIPEI TO ANTHROPIC_API_KEY - trexe prota SECRETS_AGENT.bat. Tipota den anevike. ******** & echo.
pause
exit /b 1
:lo
echo    Epezise PALIOS deiktis i MYSTIKO (km-v98, AG_PUBLIC true, sk-ant, GOCSPX).
goto failed
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE. ******** & echo.
pause
exit /b 1
