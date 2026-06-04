@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   Tools.js Generator
echo ============================================
echo.

:: Set output file
set "OUTPUT=tools.js"

:: Get current timestamp
for /f "tokens=1-4 delims=/ " %%a in ('date /t') do (
    set "datestr=%%c-%%a-%%b"
)
for /f "tokens=1-2 delims=: " %%a in ('time /t') do (
    set "timestr=%%a:%%b:00"
)
set "timestamp=!datestr! !timestr!"

:: Create temporary file for storing tool data
set "TEMP_DATA=%TEMP%\tools_data_%RANDOM%.tmp"
if exist "%TEMP_DATA%" del "%TEMP_DATA%"

echo Scanning for HTML files...
echo.

:: Scan for HTML files in subdirectories only (not root)
for /r %%F in (*.html) do (
    set "filepath=%%F"
    set "filename=%%~nxF"
    set "filedir=%%~dpF"
    set "currentdir=%CD%\"
    
    :: Check if file is in a subdirectory (not root)
    call :CheckSubdir "!filedir!" "!currentdir!" isSubdir
    
    if "!isSubdir!"=="1" (
        :: Exclude index.html
        set "checkname=%%~nxF"
        if /i not "!checkname!"=="index.html" (
            :: Get immediate parent folder name
            for %%D in ("%%~dpF.") do set "category=%%~nxD"
            
            :: Get relative path
            set "relpath=%%F"
            set "relpath=!relpath:%CD%\=!"
            set "relpath=!relpath:\=/!"
            
            :: Convert filename to display name
            set "displayname=%%~nF"
            set "displayname=!displayname:-= !"
            set "displayname=!displayname:_= !"
            
            :: Capitalize first letter of each word
            call :CapitalizeWords "!displayname!" displayname
            
            :: Store data in temp file
            echo !category!^|!displayname!^|!relpath!^|!checkname!>> "%TEMP_DATA%"
            echo Found: !relpath!
        )
    )
)

:: Check if any files were found
if not exist "%TEMP_DATA%" (
    echo.
    echo WARNING: No HTML files found in subdirectories.
    echo.
    echo The tools.js file will be created but will be empty.
    echo.
)

:: Sort the temp file (if it exists)
if exist "%TEMP_DATA%" (
    sort "%TEMP_DATA%" /o "%TEMP_DATA%"
)

:: Generate tools.js
echo.
echo Generating tools.js...

:: Write header comments
echo // Tools data - auto-generated from folder structure> "%OUTPUT%"
echo // Last updated: %timestamp%>> "%OUTPUT%"
echo window.toolsData = {>> "%OUTPUT%"
echo   "lastUpdated": "%timestamp%",>> "%OUTPUT%"
echo   "categories": [>> "%OUTPUT%"

if exist "%TEMP_DATA%" (
    set "lastCategory="
    set "firstCategory=1"
    set "firstTool=1"

    for /f "usebackq tokens=1-4 delims=|" %%A in ("%TEMP_DATA%") do (
        set "category=%%A"
        set "displayname=%%B"
        set "relpath=%%C"
        set "filename=%%D"
        
        :: Escape quotes in strings for JSON
        set "displayname=!displayname:"=\"!"
        set "relpath=!relpath:"=\"!"
        set "filename=!filename:"=\"!"
        
        :: Check if we're starting a new category
        if not "!category!"=="!lastCategory!" (
            :: Close previous category if exists
            if defined lastCategory (
                echo       ]>> "%OUTPUT%"
                echo     },>> "%OUTPUT%"
            )
            
            :: Start new category
            echo     {>> "%OUTPUT%"
            echo       "name": "!category!",>> "%OUTPUT%"
            echo       "tools": [>> "%OUTPUT%"
            
            set "lastCategory=!category!"
            set "firstTool=1"
        )
        
        :: Add tool entry
        if !firstTool! equ 0 (
            echo         ,>> "%OUTPUT%"
        )
        echo         {>> "%OUTPUT%"
        echo           "name": "!displayname!",>> "%OUTPUT%"
        echo           "path": "!relpath!",>> "%OUTPUT%"
        echo           "fileName": "!filename!">> "%OUTPUT%"
        echo         }>> "%OUTPUT%"
        
        set "firstTool=0"
    )

    :: Close last category
    if defined lastCategory (
        echo       ]>> "%OUTPUT%"
        echo     }>> "%OUTPUT%"
    )
)

echo   ]>> "%OUTPUT%"
echo };>> "%OUTPUT%"

:: Clean up temp file
if exist "%TEMP_DATA%" del "%TEMP_DATA%"

echo.
echo ============================================
echo   SUCCESS!
echo ============================================
echo.
echo tools.js has been generated successfully!
echo Location: %CD%\%OUTPUT%
echo Last updated: %timestamp%
echo.

goto :EOF

:CheckSubdir
:: Check if a file directory is a subdirectory of current directory
set "filedir=%~1"
set "currentdir=%~2"

:: Remove trailing backslash from both for comparison
if "%filedir:~-1%"=="\" set "filedir=%filedir:~0,-1%"
if "%currentdir:~-1%"=="\" set "currentdir=%currentdir:~0,-1%"

:: Check if they're different (file is in subdirectory)
if /i not "%filedir%"=="%currentdir%" (
    set "%~3=1"
) else (
    set "%~3=0"
)
goto :EOF

:CapitalizeWords
:: Subroutine to capitalize first letter of each word
setlocal
set "input=%~1"
set "output="
set "newWord=1"

for /l %%i in (0,1,200) do (
    set "char=!input:~%%i,1!"
    if "!char!"=="" goto :DoneCapitalizing
    
    if "!char!"==" " (
        set "output=!output! "
        set "newWord=1"
    ) else (
        if !newWord! equ 1 (
            :: Capitalize first letter
            for %%C in (A B C D E F G H I J K L M N O P Q R S T U V W X Y Z) do (
                if /i "!char!"=="%%C" set "char=%%C"
            )
            set "newWord=0"
        )
        set "output=!output!!char!"
    )
)

:DoneCapitalizing
endlocal & set "%~2=%output%"
goto :EOF