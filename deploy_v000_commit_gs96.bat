@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo  COMMIT: Apps Script v96 (arithmos MIA fora sto thema) + tests gs95 + ergaleia leads 27/9
if exist ".git\index.lock" del /f /q ".git\index.lock"
node tests\gs95.test.mjs
if errorlevel 1 exit /b 1
for %%N in (1 2 3 4 5 6 7 8) do (
  node tests\gs95.test.mjs --mutate=%%N
  if errorlevel 1 exit /b 1
)
git add tools\support\support_autoreply.gs tests\gs95.test.mjs deploy_v96.bat deploy_v000_leads_report.bat deploy_v000_leads_import2.bat deploy_v000_commit_gs96.bat
if errorlevel 1 exit /b 1
git commit -F commit_gs96.txt
if errorlevel 1 exit /b 1
git push origin master
exit /b %errorlevel%
