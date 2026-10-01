@echo off
chcp 65001 >nul
rem v101: to parathyro tou deploy_watch den einai UTF-8 - xoris afto to python print me ellinika apotygxanei (30/9)
set PYTHONIOENCODING=utf-8
cd /d C:\Users\User\fastwrite-project
echo.
echo  v106 = RANTEVOU EPANASYNDESIS tou KOSTA + koumpi "Mila me ton Kosta" stin Ypostirixi + Politiki v2.2 (A8).
echo         Metavasi vasis: schema\km_agent.sql (2 neoi pinakes). O voithos MENEI KRYFOS (?chat=1).
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [0/7] Gnosi tou voithou apo tis piges (i selida Politikis xtistike idi apo to keimeno)...
python tools\agent\build_knowledge.py
if errorlevel 1 goto failed

echo [1/7] Deiktes pou PREPEI na yparxoun...
findstr /c:"KM-SERVER-V106-RANTEVOU" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"CREATE TABLE IF NOT EXISTS km_agent_followups" schema\km_agent.sql >nul
if errorlevel 1 goto nm
findstr /c:"CREATE TABLE IF NOT EXISTS km_agent_grants" schema\km_agent.sql >nul
if errorlevel 1 goto nm
findstr /c:"kmAgentFollowups(env).then(" src\worker.js >nul
if errorlevel 1 goto nm
findstr /c:"id=\"hp-kostas-go\"" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"2.2 " site\legal\privacy.html >nul
if errorlevel 1 goto nm
findstr /c:"v2.2" site\legal\privacy-en.html >nul
if errorlevel 1 goto nm
findstr /c:"KM-SERVER-V105-PAKETO" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"(v105 " site\kostometro\agent\knowledge_el.md >nul
if errorlevel 1 goto nm
findstr /c:"QuickBooks" site\kostometro\agent\knowledge_el.md >nul
if errorlevel 1 goto nm
findstr /c:"KM-SERVER-V104-KOSTAS" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"function leadMailVoithos(lead)" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"class=\"ag-sub\"" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"KM-SERVER-V102-AGENT" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"if (!grant && !warm && await agentOnboarded(env, inst, dev))" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"CREATE TABLE IF NOT EXISTS km_agent_devices" schema\km_agent.sql >nul
if errorlevel 1 goto nm
findstr /c:"if (agDone()) { return false; }" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-SERVER-V100-AGENT" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"reply = agentTidy(reply);" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:".bind(code, AGENT_TOPIC, email, t, t)," src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-SERVER-V99-AGENT" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"if (agentHasSecret(text)) return json" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"el('ag-imgx').onclick = agDropImg;" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"var AG_PUBLIC = false;" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"data-agent=\"preview\" hidden" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:".ag-thumb{" site\kostometro\app.css >nul
if errorlevel 1 goto nm
findstr /c:"km-v106" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
findstr /c:"\"v\": \"v106\"" site\kostometro\version.json >nul
if errorlevel 1 goto nm
findstr /c:"&& !agTouch()) { agSend(ev); }" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"enterkeyhint=\"enter\"" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"0,50" site\kostometro\agent\knowledge_el.md >nul
if errorlevel 1 goto nm
echo    OK

echo [2/7] Deiktes pou PREPEI na leipoun...
findstr /c:"km-v102'" site\kostometro\sw.js >nul
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
node --experimental-sqlite tests\v106.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12) do (
  node --experimental-sqlite tests\v106.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node tests\legal_v21.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8) do (
  node tests\legal_v21.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\v105.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10) do (
  node --experimental-sqlite tests\v105.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\v104.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6) do (
  node --experimental-sqlite tests\v104.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\v102.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8) do (
  node --experimental-sqlite tests\v102.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node tests\v101.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4) do (
  node tests\v101.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\v100.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8) do (
  node --experimental-sqlite tests\v100.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\v99.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12) do (
  node --experimental-sqlite tests\v99.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\v98.test.mjs
if errorlevel 1 goto tf
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
git add site\kostometro\agent\knowledge_el.md tools\agent\pakketo_el.md tools\agent\smoke_v106.mjs site\kostometro\app.js site\kostometro\index.html site\kostometro\sw.js site\kostometro\version.json
if errorlevel 1 goto failed
git add site\legal\privacy.html site\legal\privacy-en.html src\km.js src\worker.js schema\km_agent.sql
if errorlevel 1 goto failed
git add tests\v106.test.mjs tests\v105.test.mjs tests\v102.test.mjs tests\legal_v21.test.mjs
if errorlevel 1 goto failed
git add deploy_v106.bat commit_v106.txt deploy_v000_rantevou_smoke.bat
if errorlevel 1 goto failed
git commit -F commit_v106.txt
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
echo    Epezise PALIOS deiktis, MYSTIKO (km-v102, AG_PUBLIC true, sk-ant, GOCSPX).
goto failed
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE. ******** & echo.
pause
exit /b 1
