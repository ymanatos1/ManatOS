@echo off
setlocal

REM ============================================================
REM  ManatOS Documentation Archiver
REM
REM  Creates one documentation.zip containing:
REM    - README.md
REM    - docs/Development.md
REM    - docs folder and all of its contents
REM    - postman folder and all of its contents
REM ============================================================

goto :Main


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
    echo Created archive:
    echo.
    echo   documentation.zip
    echo.
    endlocal
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
echo   ManatOS Documentation Archiver
echo ============================================================
echo.

REM Locate 7-Zip.

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

REM Verify required documentation files and folders before
REM touching an existing archive. This prevents accidentally
REM replacing a good archive with an incomplete one.

if not exist "README.md" (
    call :Finish 1 "README.md could not be found."
)

if not exist "docs/Development.md" (
    call :Finish 1 "docs/Development.md could not be found."
)

if not exist "docs\" (
    call :Finish 1 "The docs folder could not be found."
)

if not exist "postman\" (
    call :Finish 1 "The Postman folder could not be found."
)

REM Remove the previous archive only after all required source
REM documentation has been verified.

if exist "documentation.zip" (
    echo Removing existing documentation.zip...
    del /q "documentation.zip"

    if errorlevel 1 (
        call :Finish 1 "Could not delete existing documentation.zip."
    )

    echo.
)

echo ------------------------------------------------------------
echo Creating documentation.zip...
echo ------------------------------------------------------------

"%SEVENZIP%" a -tzip "documentation.zip" ^
    "README.md" ^
    "docs/Development.md" ^
    "docs\*" ^
    "postman\*"

if errorlevel 1 (
    call :Finish 1 "7-Zip failed while creating documentation.zip."
)

call :Finish 0 "ManatOS documentation archive was created successfully."
