@echo off
setlocal

REM ============================================================
REM  ManatOS Complete Source Archiver
REM
REM  Creates src.zip containing the complete root src folder,
REM  excluding generated/dependency/private files only:
REM
REM    root src\node_modules\
REM    api\node_modules\
REM    api\dist\
REM    api\.env
REM    ui\node_modules\
REM    ui\dist\
REM    ui\.env
REM    shared\node_modules\
REM    shared\dist\
REM ============================================================

goto :Main

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
    echo Created archive:
    echo.
    echo   src.zip
    echo.
    endlocal
    exit /b 0
)

REM echo Press any key to exit...
REM pause >nul
endlocal
exit /b %EXITCODE%

:Main

echo.
echo ============================================================
echo   ManatOS Complete Source Archiver
echo ============================================================
echo.

REM The script is expected to reside in and be run from the
REM ManatOS root src folder. Switch there automatically so that
REM double-clicking the CMD works regardless of the current shell
REM working directory.
cd /d "%~dp0"

REM Locate 7-Zip.
set "SEVENZIP=%ProgramFiles%\7-Zip\7z.exe"
if not exist "%SEVENZIP%" set "SEVENZIP=%ProgramFiles(x86)%\7-Zip\7z.exe"
if not exist "%SEVENZIP%" call :Finish 1 "7-Zip could not be found."

echo Using 7-Zip:
echo   "%SEVENZIP%"
echo.

REM Sanity-check that this really looks like the ManatOS root src.
if not exist "api\" call :Finish 1 "The api folder could not be found."
if not exist "ui\" call :Finish 1 "The ui folder could not be found."
if not exist "shared\" call :Finish 1 "The shared folder could not be found."

if exist "src.zip" (
    echo Removing existing src.zip...
    del /q "src.zip"
    if errorlevel 1 call :Finish 1 "Could not delete existing src.zip."
    echo.
)

echo ------------------------------------------------------------
echo Creating src.zip...
echo ------------------------------------------------------------

REM Archive everything in the root src folder while excluding only
REM the requested dependency/build folders and API/UI .env files.
REM Path-qualified exclusions deliberately avoid excluding unrelated
REM folders/files that happen to have the same name elsewhere.
"%SEVENZIP%" a -tzip "src.zip" ".\*" ^
    -xr!"node_modules\*" ^
    -xr!"api\node_modules\*" ^
    -xr!"api\dist\*" ^
    -xr!"api\.env" ^
    -xr!"ui\node_modules\*" ^
    -xr!"ui\dist\*" ^
    -xr!"ui\.env" ^
    -xr!"shared\node_modules\*" ^
    -xr!"shared\dist\*" ^
    -x!"src.zip"

if errorlevel 1 call :Finish 1 "7-Zip failed while creating src.zip."

call :Finish 0 "The complete ManatOS root source archive was created successfully."
