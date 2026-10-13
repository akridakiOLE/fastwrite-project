@echo off
chcp 65001 >nul
rem KM-PRO-V197 13/10/2026 - F3 omada (manager, istoriko, Kostas krymmenos sto melos): tests, schema+deploy STAGING mono, e2e f2check+f3check, commit+push pro. TIPOTA sto Free.
cd /d C:\Users\User\fastwrite-pro
set "OUT=C:\Users\User\fastwrite-pro\Claude outputs\pro\v197_out.txt"
set "KM_PW_DIR=%LOCALAPPDATA%\km-pw"
> "%OUT%" echo PRO v197 %date% %time%
for %%f in (src\km.js src\km_pro.js src\km_team.js site\kostometro\app.js site\km-crypto.js) do (
  node --check %%f >> "%OUT%" 2>&1
  if errorlevel 1 ( echo SYNTAX_FAIL %%f >> "%OUT%" & goto failed )
)
for %%f in (tests\*.test.mjs) do (
  node %%f > nul 2>&1
  if errorlevel 1 ( echo TEST_FAIL %%f >> "%OUT%" & goto failed )
)
for /L %%i in (1,1,20) do (
  node tests\pro_f2.test.mjs --mutate=%%i > nul 2>&1
  if errorlevel 1 ( echo MUT_MISS_F2 %%i >> "%OUT%" & goto failed )
  node tests\pro_f3.test.mjs --mutate=%%i > nul 2>&1
  if errorlevel 1 ( echo MUT_MISS_F3 %%i >> "%OUT%" & goto failed )
)
echo TESTS_OK >> "%OUT%"
node tools\pro\d1apply.mjs schema\km_team.sql >> "%OUT%" 2>&1
if errorlevel 1 goto failed
call npx --yes wrangler deploy --env staging >> "%OUT%" 2>&1
if errorlevel 1 goto failed
echo DEPLOY_STAGING_OK >> "%OUT%"
node tools\pro\f3check.mjs >> "%OUT%" 2>&1
if errorlevel 1 ( echo F3CHECK_FAIL >> "%OUT%" & goto failed )
echo F3CHECK_OK >> "%OUT%"
node tools\pro\f2check.mjs >> "%OUT%" 2>&1
if errorlevel 1 ( echo F2CHECK_FAIL >> "%OUT%" & goto failed )
echo F2CHECK_OK >> "%OUT%"
git add src/km.js src/km_pro.js src/km_team.js schema/km_team.sql site/km-crypto.js site/kostometro/app.js site/kostometro/app.css site/kostometro/index.html site/kostometro/sw.js site/kostometro/version.json tests/pro_f1.test.mjs tests/pro_f2.test.mjs tests/pro_f3.test.mjs tools/pro/f3check.mjs tools/pro/d1apply.mjs deploy_v000_pro_v197.bat deploy_v000_pro_push.bat commit_pro_v197.txt >> "%OUT%" 2>&1
git commit -F commit_pro_v197.txt >> "%OUT%" 2>&1
git push origin pro >> "%OUT%" 2>&1
git log -3 --oneline >> "%OUT%" 2>&1
git branch -vv >> "%OUT%" 2>&1
echo PRO_V197_TELOS >> "%OUT%"
cd /d C:\Users\User\fastwrite-pro
exit /b 0
:failed
echo PRO_V197_APETYXE >> "%OUT%"
cd /d C:\Users\User\fastwrite-pro
exit /b 1
