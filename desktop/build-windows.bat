@echo off
echo ========================================
echo Pharma ERP Desktop Build Script
echo ========================================

:: Check prerequisites
echo Checking prerequisites...
where node >nul 2>&1 || (echo Node.js not found. Please install Node.js && exit /b 1)
where python >nul 2>&1 || (echo Python not found. Please install Python && exit /b 1)

:: Set environment
set NODE_ENV=production
set BUILD_TARGET=windows

echo.
echo [1/6] Installing dependencies...
cd desktop
call npm install

echo.
echo [2/6] Building frontend...
cd ../frontend
call npm run build
xcopy /E /I /Y build ..\desktop\build

echo.
echo [3/6] Packaging Python backend...
cd ../backend
pip install pyinstaller
pyinstaller pharma-backend.spec --noconfirm

echo.
echo [4/6] Copying backend executable...
xcopy /Y dist\pharma-backend.exe ..\desktop\resources\backend\

echo.
echo [5/6] Creating SQLite database...
cd ../desktop
python scripts/create-local-db.py

echo.
echo [6/6] Building Windows installer...
call npm run electron-build

echo.
echo ========================================
echo Build complete!
echo Installer location: desktop\dist\
echo ========================================

pause