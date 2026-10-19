@echo off
chcp 65001 >nul
cd /d "%~dp0"
where python >nul 2>&1
if errorlevel 1 (
  echo Python не найден. Установите его с python.org и отметьте галочку "Add Python to PATH".
  pause
  exit /b
)
echo Проверяю библиотеки...
python -m pip install -q --disable-pip-version-check -r requirements.txt
python server.py
pause
