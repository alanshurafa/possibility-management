@echo off
REM Double-click this file to open the PM Bubble Map on Windows.
REM It just starts the local server (serve.py) using your installed Python 3.
cd /d "%~dp0"
where py >nul 2>nul && (
    py -3 serve.py
    goto :eof
)
where python >nul 2>nul && (
    python serve.py
    goto :eof
)
echo.
echo Python 3 is required but was not found on this PC.
echo Install it (tick "Add to PATH") from https://www.python.org/downloads/ and run this again.
echo.
pause
