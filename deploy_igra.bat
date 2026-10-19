@echo off
rem ==========================================================
rem  Выкладка «Своей игры» на startdota.ru и сборка SvoyaIgra.exe
rem  1) сайт (новые API, вкладка в меню, nginx /igra/) — обычный vps_deploy.py
rem  2) служба игры — vps_igra_deploy.py
rem  3) SvoyaIgra.exe для класса без интернета — igra\build.bat
rem  Весь вывод пишется в deploy_igra.log (его читает Claude).
rem ==========================================================
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
set PYTHONUNBUFFERED=1

if "%VPS_PG_PASSWORD%"=="" (
  echo Для выкладки сайта нужен пароль базы данных на сервере ^(VPS_PG_PASSWORD^).
  set /p VPS_PG_PASSWORD=Введите его и нажмите Enter:
)

echo ===== %date% %time% ===== > deploy_igra.log

echo.
echo [1/3] Выкладываю сайт (5-10 минут)...
python scripts\vps_deploy.py >> deploy_igra.log 2>&1
if errorlevel 1 (
  echo ОШИБКА при выкладке сайта. Подробности в deploy_igra.log
  echo SITE_FAILED >> deploy_igra.log
  pause
  exit /b
)
echo SITE_OK >> deploy_igra.log

echo [2/3] Выкладываю игру...
python scripts\vps_igra_deploy.py >> deploy_igra.log 2>&1
if errorlevel 1 (
  echo ОШИБКА при выкладке игры. Подробности в deploy_igra.log
  echo IGRA_FAILED >> deploy_igra.log
  pause
  exit /b
)
echo IGRA_OK >> deploy_igra.log

echo [3/3] Собираю SvoyaIgra.exe...
cd igra
python -m pip install -q --disable-pip-version-check -r requirements-build.txt >> ..\deploy_igra.log 2>&1
python -m PyInstaller --noconfirm --clean --onefile --windowed --name SvoyaIgra --icon icon.ico --add-data "static;static" --add-data "demo\demo.siq;demo" app.py >> ..\deploy_igra.log 2>&1
if exist dist\SvoyaIgra.exe (
  copy /y dist\SvoyaIgra.exe SvoyaIgra.exe >nul
  echo EXE_OK >> ..\deploy_igra.log
) else (
  echo EXE_FAILED >> ..\deploy_igra.log
)
cd ..

echo ALL_DONE >> deploy_igra.log
echo.
echo Готово! Сайт: https://startdota.ru/igra/   Exe: папка igra\SvoyaIgra.exe
pause
