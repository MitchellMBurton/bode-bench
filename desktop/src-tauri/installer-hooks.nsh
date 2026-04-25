!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Closing running Scientific Listening Instrument processes..."
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /IM "scientific-listening-instrument.exe" /F /T'
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /IM "bach-cello-console.exe" /F /T'
  Sleep 1200
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Closing running Scientific Listening Instrument processes..."
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /IM "scientific-listening-instrument.exe" /F /T'
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /IM "bach-cello-console.exe" /F /T'
  Sleep 1200
!macroend
