@echo off
title VeloTrainer - Van Rysel D100
echo ===================================================
echo     LANCEMENT DE L'APPLICATION VELOTRAINER
echo        Special Van Rysel D100 (Zwift Edition)
echo ===================================================
echo.
where py >nul 2>nul
if errorlevel 1 goto use_python
py "%~dp0server.py"
goto check_result

:use_python
python "%~dp0server.py"

:check_result
if errorlevel 1 (
    echo.
    echo Erreur lors du lancement de server.py.
    pause
)
