@echo off
chcp 65001 >nul
rem KM-PRO-F5 15/10/2026 - metrisi kostous: 20 pragmatikes anagnoseis Sonnet sto STAGING (read-test admin). TIPOTA sto Free, TIPOTA stin paragogi, kanena deploy.
cd /d C:\Users\User\fastwrite-pro
node tools\pro\measure20.mjs
set RC=%errorlevel%
cd /d C:\Users\User\fastwrite-pro
exit /b %RC%
