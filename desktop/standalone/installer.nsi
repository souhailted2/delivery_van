; ============================================================
;  ERP Van Sales — Windows Installer (NSIS)
;  بناء ملف تثبيت Windows بدون Electron
; ============================================================
; Run: makensis desktop\standalone\installer.nsi
; Output: desktop\dist-standalone\ERP-Van-Sales-Setup.exe

!define PRODUCT_NAME    "ERP Van Sales"
!define PRODUCT_VERSION "1.0.0"
!define PRODUCT_PUBLISHER "Allal Store"
!define PRODUCT_REG_KEY "Software\ERPVanSales"
!define PRODUCT_UNINST  "Software\Microsoft\Windows\CurrentVersion\Uninstall\ERP Van Sales"

; ── Compression ────────────────────────────────────────────
SetCompressor /SOLID lzma
SetCompressorDictSize 64

; ── General ────────────────────────────────────────────────
Name                "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile             "..\dist-standalone\ERP-Van-Sales-Setup.exe"
InstallDir          "$PROGRAMFILES64\ERP Van Sales"
InstallDirRegKey    HKLM "${PRODUCT_REG_KEY}" "InstallDir"
RequestExecutionLevel admin
ShowInstDetails     show
ShowUnInstDetails   show

; ── Pages ──────────────────────────────────────────────────
!include "MUI2.nsh"
!define MUI_ABORTWARNING
!define MUI_ICON "..\build\icon.ico"
!define MUI_UNICON "..\build\icon.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Arabic"

; ── Install Section ─────────────────────────────────────────
Section "!${PRODUCT_NAME}" SEC_MAIN

  SetOverwrite on

  ; ── Node.js runtime ──────────────────────────
  SetOutPath "$INSTDIR"
  File "..\bundle\node.exe"

  ; ── App icon ─────────────────────────────────
  File /nonfatal "..\build\icon.ico"

  ; ── Standalone entry & launcher ──────────────
  SetOutPath "$INSTDIR\standalone"
  File "server.js"
  File "launcher.vbs"

  ; ── Express server code ───────────────────────
  SetOutPath "$INSTDIR\server"
  File /r "..\server\*.*"

  ; ── node_modules (production) ─────────────────
  SetOutPath "$INSTDIR\node_modules"
  File /r "..\node_modules\*.*"

  ; ── React renderer (built frontend) ──────────
  SetOutPath "$INSTDIR\renderer"
  File /r "..\renderer\*.*"

  ; ── Start Menu shortcut ───────────────────────
  CreateDirectory "$SMPROGRAMS\ERP Van Sales"
  CreateShortCut "$SMPROGRAMS\ERP Van Sales\ERP Van Sales.lnk" \
    "$WINDIR\System32\wscript.exe" \
    '"$INSTDIR\standalone\launcher.vbs"' \
    "$INSTDIR\icon.ico" 0

  ; ── Desktop shortcut ─────────────────────────
  CreateShortCut "$DESKTOP\ERP Van Sales.lnk" \
    "$WINDIR\System32\wscript.exe" \
    '"$INSTDIR\standalone\launcher.vbs"' \
    "$INSTDIR\icon.ico" 0

  ; ── Uninstaller ───────────────────────────────
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "${PRODUCT_REG_KEY}"  "InstallDir"    "$INSTDIR"
  WriteRegStr HKLM "${PRODUCT_UNINST}"   "DisplayName"   "${PRODUCT_NAME}"
  WriteRegStr HKLM "${PRODUCT_UNINST}"   "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM "${PRODUCT_UNINST}"   "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "${PRODUCT_UNINST}"   "Publisher"     "${PRODUCT_PUBLISHER}"
  WriteRegDWORD HKLM "${PRODUCT_UNINST}" "NoModify" 1
  WriteRegDWORD HKLM "${PRODUCT_UNINST}" "NoRepair"  1

SectionEnd

; ── Uninstall Section ───────────────────────────────────────
Section "Uninstall"

  ; Remove shortcuts
  Delete "$SMPROGRAMS\ERP Van Sales\ERP Van Sales.lnk"
  RMDir  "$SMPROGRAMS\ERP Van Sales"
  Delete "$DESKTOP\ERP Van Sales.lnk"

  ; Remove installation directory (does NOT remove AppData/user data)
  RMDir /r "$INSTDIR"

  ; Remove registry entries
  DeleteRegKey HKLM "${PRODUCT_UNINST}"
  DeleteRegKey HKLM "${PRODUCT_REG_KEY}"

  ; Inform user that their data is preserved
  MessageBox MB_OK "تم إلغاء التثبيت.$\n$\nملاحظة: بياناتك محفوظة في:$\n$APPDATA\ERP Van Sales$\nيمكنك حذفها يدوياً إن أردت."

SectionEnd
