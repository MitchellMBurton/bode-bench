!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Closing running Bach Cello Console processes..."
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /IM "bach-cello-console.exe" /F /T'
  Sleep 1200
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Closing running Bach Cello Console processes..."
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /IM "bach-cello-console.exe" /F /T'
  Sleep 1200
!macroend
