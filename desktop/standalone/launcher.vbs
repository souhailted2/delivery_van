' ERP Van Sales — Launcher
' Starts the Node.js server without showing a console window.
' The browser opens automatically to http://localhost:37891
'
' Installation structure:
'   $INSTDIR\
'     node.exe              <-- Node.js runtime
'     standalone\
'       launcher.vbs        <-- THIS file
'       server.js           <-- server entry point

Dim WShell, FSO, StandaloneDir, InstDir, NodeExe, ServerJs, Cmd

Set WShell       = CreateObject("WScript.Shell")
Set FSO          = CreateObject("Scripting.FileSystemObject")

' standalone\ dir = folder containing this VBS file
StandaloneDir = FSO.GetParentFolderName(WScript.ScriptFullName)

' installation root = one level above standalone\
InstDir = FSO.GetParentFolderName(StandaloneDir)

NodeExe  = InstDir       & "\node.exe"
ServerJs = StandaloneDir & "\server.js"

If Not FSO.FileExists(NodeExe) Then
  MsgBox "لم يتم العثور على node.exe في:" & vbCrLf & InstDir, 16, "ERP Van Sales"
  WScript.Quit 1
End If

If Not FSO.FileExists(ServerJs) Then
  MsgBox "لم يتم العثور على server.js في:" & vbCrLf & StandaloneDir, 16, "ERP Van Sales"
  WScript.Quit 1
End If

' Run node.exe from the installation root, window style 0 = hidden (no console)
Cmd = """" & NodeExe & """ """ & ServerJs & """"
WShell.CurrentDirectory = InstDir
WShell.Run Cmd, 0, False
