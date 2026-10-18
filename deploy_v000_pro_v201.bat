@echo off
chcp 65001 >nul
rem KM-PRO-V201 18/10/2026 - Brief "Tria skalia": ypoloipo se xrimata, PRO.mini (agora mesa stin efarmogi + elegxos server), prolirwmi PRO web, dokimi PRO me karta (Paddle), Free xoris Kosta / othoni kleidiou.
rem Tests + metallakseis, sxima km_bal STO STAGING, deploy STAGING mono, elegxos akri-se-akri, commit+push pro. TIPOTA sto Free/paragogi.
cd /d C:\Users\User\fastwrite-pro
set "OUT=C:\Users\User\fastwrite-pro\Claude outputs\pro\v201_out.txt"
> "%OUT%" echo PRO v201 %date% %time%
for %%f in (src\km.js src\km_pro.js src\km_paddle.js src\km_bal.js src\km_iap.js src\worker.js site\kostometro\app.js tools\pro\v201check.mjs) do (
  node --check %%f >> "%OUT%" 2>&1
  if errorlevel 1 ( echo SYNTAX_FAIL %%f >> "%OUT%" & goto failed )
)
for %%f in (tests\*.test.mjs) do (
  node %%f > nul 2>&1
  if errorlevel 1 ( echo TEST_FAIL %%f >> "%OUT%" & goto failed )
)
for /L %%i in (1,1,43) do (
  node tests\pro_v201.test.mjs --mutate=%%i > nul 2>&1
  if errorlevel 1 ( echo MUT_MISS_V201 %%i >> "%OUT%" & goto failed )
)
for /L %%i in (1,1,38) do (
  node tests\pro_f5.test.mjs --mutate=%%i > nul 2>&1
  if errorlevel 1 ( echo MUT_MISS_F5 %%i >> "%OUT%" & goto failed )
)
for /L %%i in (1,1,8) do (
  node tests\pro_f1.test.mjs --mutate=%%i > nul 2>&1
  if errorlevel 1 ( echo MUT_MISS_F1 %%i >> "%OUT%" & goto failed )
)
echo TESTS_OK >> "%OUT%"
node tools\pro\d1apply.mjs schema\km_bal.sql >> "%OUT%" 2>&1
if errorlevel 1 ( echo D1_FAIL >> "%OUT%" & goto failed )
call npx --yes wrangler deploy --env staging >> "%OUT%" 2>&1
if errorlevel 1 goto failed
echo DEPLOY_STAGING_OK >> "%OUT%"
ping -n 25 127.0.0.1 >nul
node tools\pro\v201check.mjs >> "%OUT%" 2>&1
if errorlevel 1 ( echo CHECK_FAIL >> "%OUT%" & goto failed )
git add src/km_bal.js src/km_iap.js src/km_pro.js src/km_paddle.js src/km.js src/worker.js schema/km_bal.sql site/kostometro/app.js site/kostometro/index.html site/kostometro/version.json site/kostometro/sw.js site/pro/index.html wrangler.toml tests/pro_v201.test.mjs tests/pro_f5.test.mjs tests/pro_f1.test.mjs tests/pro_f2.test.mjs tests/v89.test.mjs tests/v99.test.mjs tests/v100.test.mjs tests/v102.test.mjs tests/v105.test.mjs tests/v106.test.mjs tests/v107.test.mjs tests/v113.test.mjs tests/v122.test.mjs tests/v124.test.mjs tests/v126.test.mjs tools/pro/kostas_measure.mjs tools/pro/v201check.mjs deploy_v000_pro_v201a.bat deploy_v000_pro_v201.bat commit_pro_v201.txt >> "%OUT%" 2>&1
git commit -F commit_pro_v201.txt >> "%OUT%" 2>&1
git push origin pro >> "%OUT%" 2>&1
git log -2 --oneline >> "%OUT%" 2>&1
echo PRO_V201_TELOS >> "%OUT%"
cd /d C:\Users\User\fastwrite-pro
exit /b 0
:failed
echo PRO_V201_APETYXE >> "%OUT%"
cd /d C:\Users\User\fastwrite-pro
exit /b 1
