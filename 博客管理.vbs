Option Explicit
Dim shell, files, root
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root
On Error Resume Next
shell.Run "node """ & root & "\tools\blog-manager\server.cjs"" --open", 0, False
If Err.Number <> 0 Then
  MsgBox "Cannot start the blog manager. Please check Node.js or open README.md.", 48, "Blog Manager"
End If
