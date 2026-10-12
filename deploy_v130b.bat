@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d C:\Users\User\fastwrite-project
echo  v130b = MONO to Apps Script (mail_log.gs): to support@ einai Google Group - oi pelates DEN einai "automatoi".
echo          KAMIA allagi server.
if exist ".git\index.lock" del /f /q ".git\index.lock"
node --check src\km.js
if errorlevel 1 goto failed
node --experimental-sqlite tests\v130.test.mjs
if errorlevel 1 goto failed
for %%N in (1 2 3 4 5 6 7 8 9) do (
  node --experimental-sqlite tests\v130.test.mjs --mutate=%%N
  if errorlevel 1 goto failed
)
node --experimental-sqlite tests\v129.test.mjs
if errorlevel 1 goto failed
git add tools\support\mail_log.gs tests\v130.test.mjs deploy_v130.bat deploy_v130b.bat commit_v130b.txt
if errorlevel 1 goto failed
git commit -F commit_v130b.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo OK - v130b
exit /b 0
:failed
echo  ******** APETYXE - tipota den anevike. ********
exit /b 1
