@echo off
rem ==========================================================
rem  Сборка приложения SvoyaIgra.exe
rem  Нужно один раз: Python + интернет. Готовый exe потом
rem  работает на любом Windows 10/11 без Python и без интернета.
rem ==========================================================
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
  echo Python не найден. Установите Python 3.12 с python.org и отметьте галочку "Add Python to PATH".
  pause
  exit /b
)

echo [1/3] Устанавливаю библиотеки для сборки...
python -m pip install -q --disable-pip-version-check -r requirements-build.txt
if errorlevel 1 (
  echo Не удалось установить библиотеки. Проверьте интернет.
  pause
  exit /b
)

echo [2/3] Собираю SvoyaIgra.exe, это займёт пару минут...
python -m PyInstaller --noconfirm --clean --onefile --windowed ^
  --name SvoyaIgra --icon icon.ico ^
  --add-data "static;static" --add-data "demo\demo.siq;demo" ^
  app.py
if errorlevel 1 (
  echo Сборка не удалась. Пришлите текст ошибки выше.
  pause
  exit /b
)

echo [3/3] Готово!
copy /y dist\SvoyaIgra.exe SvoyaIgra.exe >nul
echo.
echo Файл SvoyaIgra.exe лежит в этой папке.
echo Скопируйте его на компьютер ведущего и на компьютеры учеников.
pause
