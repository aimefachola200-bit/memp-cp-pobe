@echo off
title Publier EduGestion Pro Master
cd /d "%~dp0"
echo ============================================================
echo    Publication de EduGestion Pro Master sur Internet
echo    Adresse : https://edugestion-pro-master.surge.sh
echo ============================================================
echo.

REM --- 1. Le dossier doit etre extrait du zip ---
echo "%~dp0" | findstr /i "\\Temp\\ .zip" >nul
if not errorlevel 1 (
  echo [!] Vous avez lance ce fichier depuis l'interieur du zip.
  echo     Fermez cette fenetre. Faites clic droit sur le zip puis
  echo     "Extraire tout...", ouvrez le dossier extrait et relancez.
  pause & exit /b
)
if not exist "index.html" (
  echo [!] Ce fichier doit rester dans le dossier de l'application,
  echo     a cote de index.html.
  pause & exit /b
)

REM --- 2. Node.js doit etre installe ---
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js n'est pas installe sur cet ordinateur.
  echo     La page de telechargement va s'ouvrir : prenez la version LTS,
  echo     installez-la, puis relancez ce fichier.
  start https://nodejs.org/fr/download
  pause & exit /b
)

REM --- 3. Installer Surge dans un dossier personnel (evite EPERM) ---
set "OUTILS=%LOCALAPPDATA%\surge-outils"
set "SURGE=%OUTILS%\node_modules\.bin\surge.cmd"
if not exist "%SURGE%" (
  echo Installation de Surge, patientez une minute...
  call npm install surge --prefix "%OUTILS%" --cache "%OUTILS%\cache" --no-audit --no-fund --loglevel=error
)
if not exist "%SURGE%" (
  echo.
  echo [!] L'installation de Surge a echoue. Verifiez la connexion Internet,
  echo     desactivez un instant l'antivirus, puis relancez ce fichier.
  pause & exit /b
)

REM --- 4. Nouveau compte ou compte deja cree ? ---
echo.
choice /c ON /m "Voulez-vous vous connecter avec un NOUVEAU compte Surge (O = oui, N = non)"
if errorlevel 2 goto publier
call "%SURGE%" logout >nul 2>nul

:publier
echo.
echo ------------------------------------------------------------
echo  Surge va demander :
echo    email    : votre adresse e-mail, SANS accent
echo    password : votre mot de passe (il reste INVISIBLE, c'est normal)
echo  Pour un nouveau compte, choisissez un nouveau mot de passe.
echo  Si on vous montre "project" et "domain", appuyez sur Entree.
echo ------------------------------------------------------------
echo.
call "%SURGE%" . edugestion-pro-master.surge.sh
echo.
echo Si vous voyez "Success! - Published", c'est en ligne :
echo    https://edugestion-pro-master.surge.sh
echo.
pause
