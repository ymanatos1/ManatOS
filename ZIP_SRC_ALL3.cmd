@echo off
setlocal

REM ============================================================
REM  ManatOS Source Archiver
REM ============================================================

goto :Main


REM ============================================================
REM :ZipFolder
REM ============================================================

:ZipFolder

set "FOLDER=%~1"
set "ARCHIVE=%FOLDER%.zip"

echo ------------------------------------------------------------
echo Creating %ARCHIVE%...
echo ------------------------------------------------------------

if exist "%ARCHIVE%" (
    del /q "%ARCHIVE%"

    if errorlevel 1 (
        echo.
        echo ERROR: Could not delete existing %ARCHIVE%.
        echo.
        exit /b 1
    )
)

"%SEVENZIP%" a -tzip "%ARCHIVE%" ".\%FOLDER%\*" -xr!node_modules -xr!dist

if errorlevel 1 (
    echo.
    echo ERROR: 7-Zip failed while creating %ARCHIVE%.
    echo.
    exit /b 1
)

echo.
echo Created successfully:
echo   %ARCHIVE%
echo.

exit /b 0


REM ============================================================
REM :Finish
REM ============================================================

:Finish

set "EXITCODE=%~1"
set "MESSAGE=%~2"

echo.
echo ============================================================

if "%EXITCODE%"=="0" (
    echo   SUCCESS
) else (
    echo   ERROR
)

echo ============================================================
echo.
echo %MESSAGE%
echo.

if "%EXITCODE%"=="0" (
    echo Created archives:
    echo.
    echo   api.zip
    echo   shared.zip
    echo   ui.zip
    echo.
    exit /b 0
)

echo Press any key to exit...
pause >nul

endlocal
exit /b %EXITCODE%


REM ============================================================
REM :Main
REM ============================================================

:Main

echo.
echo ============================================================
echo   ManatOS Source Archiver
echo   Excluding node_modules and dist
echo ============================================================
echo.

REM Locate 7-Zip

set "SEVENZIP=%ProgramFiles%\7-Zip\7z.exe"

if not exist "%SEVENZIP%" (
    set "SEVENZIP=%ProgramFiles(x86)%\7-Zip\7z.exe"
)

if not exist "%SEVENZIP%" (
    call :Finish 1 "7-Zip could not be found."
)

echo Using 7-Zip:
echo   "%SEVENZIP%"
echo.

REM Verify source folders

if not exist "api\" (
    call :Finish 1 "The api folder could not be found."
)

if not exist "shared\" (
    call :Finish 1 "The shared folder could not be found."
)

if not exist "ui\" (
    call :Finish 1 "The ui folder could not be found."
)

REM Create exactly three archives

call :ZipFolder api
if errorlevel 1 (
    call :Finish 1 "Failed to create api.zip."
)

call :ZipFolder shared
if errorlevel 1 (
    call :Finish 1 "Failed to create shared.zip."
)

call :ZipFolder ui
if errorlevel 1 (
    call :Finish 1 "Failed to create ui.zip."
)

call :Finish 0 "All ManatOS source archives were created successfully."

