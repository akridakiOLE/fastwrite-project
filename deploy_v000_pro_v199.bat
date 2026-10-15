@echo off
chcp 65001 >nul
rem KM-PRO-V199 15/10/2026 - F5: orio anagnoseon + Paddle webhook (mock) + roes Free-PRO/neos PRO + A10. Tests+metallaxeis, schema+secret+deploy STAGING mono, e2e f5check+f4check+f3check+f2check, commit+push pro. TIPOTA sto Free, TIPOTA stin paragogi, KANENAS logariasmos Paddle.
cd /d C:\Users\User\fastwrite-pro
set "OUT=C:\Users\User\fastwrite-pro\Claude outputs\pro\v199_out.txt"
set "KM_PW_DIR=%LOCALAPPDATA%\km-pw"
set "PYTHONIOENCODING=utf-8"
> "%OUT%" echo PRO v199 %date% %time%
for %%f in (src\km.js src\km_pro.js src\km_paddle.js src\km_team.js src\km_acct.js site\kostometro\app.js site\km-crypto.js static\km_mailbox.js tools\pro\f4check.mjs tools\pro\f4local.mjs tools\pro\f5check.mjs tools\pro\paddle_mock.mjs) do (
  node --check %%f >> "%OUT%" 2>&1
  if errorlevel 1 ( echo SYNTAX_FAIL %%f >> "%OUT%" & goto failed )
)
set "KM_PY=C:\Users\User\fastwrite-pro\venv\Scripts\python.exe"
if not exist "%KM_PY%" ( echo VENV_FAIL >> "%OUT%" & goto failed )
"%KM_PY%" -m py_compile km_mailbox.py main_api.py >> "%OUT%" 2>&1
if errorlevel 1 ( echo PY_SYNTAX_FAIL >> "%OUT%" & goto failed )
for %%f in (tests\*.test.mjs) do (
  node %%f > nul 2>&1
  if errorlevel 1 ( echo TEST_FAIL %%f >> "%OUT%" & goto failed )
)
node tests\pro_f5.test.mjs > "Claude outputs\pro\v199_pro_f5.txt" 2>&1
"%KM_PY%" tests\test_km_mailbox.py > "Claude outputs\pro\v199_pytest.txt" 2>&1
if errorlevel 1 ( echo TEST_FAIL test_km_mailbox.py >> "%OUT%" & goto failed )
for /L %%i in (1,1,8) do (
  node tests\pro_f1.test.mjs --mutate=%%i > nul 2>&1
  if errorlevel 1 ( echo MUT_MISS_F1 %%i >> "%OUT%" & goto failed )
)
for /L %%i in (1,1,20) do (
  node tests\pro_f2.test.mjs --mutate=%%i > nul 2>&1
  if errorlevel 1 ( echo MUT_MISS_F2 %%i >> "%OUT%" & goto failed )
  node tests\pro_f3.test.mjs --mutate=%%i > nul 2>&1
  if errorlevel 1 ( echo MUT_MISS_F3 %%i >> "%OUT%" & goto failed )
)
for /L %%i in (1,1,25) do (
  node tests\pro_f4.test.mjs --mutate=%%i > nul 2>&1
  if errorlevel 1 ( echo MUT_MISS_F4 %%i >> "%OUT%" & goto failed )
)
for /L %%i in (1,1,47) do (
  node tests\pro_f5.test.mjs --mutate=%%i > nul 2>&1
  if errorlevel 1 ( echo MUT_MISS_F5 %%i >> "%OUT%" & goto failed )
)
for /L %%i in (1,1,26) do (
  "%KM_PY%" tests\test_km_mailbox.py --mutate=%%i > nul 2>&1
  if errorlevel 1 ( echo MUT_MISS_PY %%i >> "%OUT%" & goto failed )
)
echo TESTS_OK >> "%OUT%"
rem --- mystiko webhook STAGING (diko mas, oxi Paddle) - ektos git ---
if not exist "secrets" mkdir "secrets"
if not exist "secrets\paddle_staging_whsec.txt" node -e "process.stdout.write('pdl_ntfset_staging_'+require('crypto').randomBytes(24).toString('hex'))" > "secrets\paddle_staging_whsec.txt"
type "secrets\paddle_staging_whsec.txt" | call npx --yes wrangler secret put PADDLE_WEBHOOK_SECRET --env staging >> "%OUT%" 2>&1
if errorlevel 1 ( echo SECRET_FAIL >> "%OUT%" & goto failed )
node tools\pro\d1apply.mjs schema\km_pro_f5.sql >> "%OUT%" 2>&1
if errorlevel 1 goto failed
call npx --yes wrangler deploy --env staging >> "%OUT%" 2>&1
if errorlevel 1 goto failed
echo DEPLOY_STAGING_OK >> "%OUT%"
set "KM_F5_MODE=staging"
node tools\pro\f5check.mjs >> "%OUT%" 2>&1
if errorlevel 1 ( echo F5CHECK_FAIL >> "%OUT%" & goto failed )
echo F5CHECK_OK >> "%OUT%"
set "KM_F4_MODE=staging"
node tools\pro\f4check.mjs >> "%OUT%" 2>&1
if errorlevel 1 ( echo F4CHECK_FAIL >> "%OUT%" & goto failed )
echo F4CHECK_OK >> "%OUT%"
node tools\pro\f3check.mjs >> "%OUT%" 2>&1
if errorlevel 1 ( echo F3CHECK_FAIL >> "%OUT%" & goto failed )
echo F3CHECK_OK >> "%OUT%"
node tools\pro\f2check.mjs >> "%OUT%" 2>&1
if errorlevel 1 ( echo F2CHECK_FAIL >> "%OUT%" & goto failed )
echo F2CHECK_OK >> "%OUT%"
git add src/km.js src/km_pro.js src/km_paddle.js schema/km_pro_f5.sql site/kostometro/app.js site/kostometro/app.css site/kostometro/index.html site/kostometro/sw.js site/kostometro/version.json site/pro/index.html km_mailbox.py static/km_mailbox.js wrangler.toml tests/pro_f1.test.mjs tests/pro_f4.test.mjs tests/pro_f5.test.mjs tests/test_km_mailbox.py tools/pro/f4local.mjs tools/pro/f5check.mjs tools/pro/paddle_mock.mjs tools/pro/measure20.mjs deploy_v000_pro_v199.bat deploy_v000_pro_f5_metrisi.bat commit_pro_v199.txt >> "%OUT%" 2>&1
git commit -F commit_pro_v199.txt >> "%OUT%" 2>&1
git push origin pro >> "%OUT%" 2>&1
git log -3 --oneline >> "%OUT%" 2>&1
git branch -vv >> "%OUT%" 2>&1
echo PRO_V199_TELOS >> "%OUT%"
cd /d C:\Users\User\fastwrite-pro
exit /b 0
:failed
echo PRO_V199_APETYXE >> "%OUT%"
cd /d C:\Users\User\fastwrite-pro
exit /b 1
