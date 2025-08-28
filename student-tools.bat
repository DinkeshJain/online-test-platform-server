@echo off
title Student Results Tools
echo.
echo ==========================================
echo    STUDENT RESULTS TOOLS
echo ==========================================
echo.
echo 1. Export Excel with all students (single sheet)
echo 2. Export Excel by course (separate sheets)
echo 3. Fix incorrect answer logic
echo 4. Exit
echo.
set /p choice="Choose option (1-4): "

if "%choice%"=="1" (
    echo.
    echo 📊 Exporting all student results to single Excel sheet...
    echo =====================================================
    node student-excel-export.js
    echo.
    echo ✅ Done! Check for Excel file in current directory.
)

if "%choice%"=="2" (
    echo.
    echo 📊 Exporting student results by course (separate sheets)...
    echo ========================================================
    node student-excel-by-course.js
    echo.
    echo ✅ Done! Each course has its own sheet with only relevant subjects.
)

if "%choice%"=="3" (
    echo.
    echo 🔧 Checking for incorrect answers...
    echo ===================================
    node fix-answers.js
)

if "%choice%"=="4" (
    echo Goodbye!
    exit /b
)

echo.
pause
