' ---------------------------------------------------------------------
'  Deskside Radio - open it without a console window.
'
'  "Win - Open Deskside Radio.cmd" does the work: it starts the browser
'  and takes the resize grip off the window. What it cannot do is start
'  without a console, because a .cmd is run by cmd.exe and cmd.exe gets
'  one. WindowStyle 7 on the shortcut minimises that console, but Windows
'  creates and draws it first -- so what you actually see at launch is a
'  black rectangle at the top left and a taskbar button, both of which
'  appear and vanish again before the radio is on screen.
'
'  Started from here it never exists at all. WScript.Shell.Run with a
'  window style of 0 creates the process with no window. Nothing else
'  changes: same script, same argument, same wait for the window.
'
'  This file is four lines of work and no logic. It is deliberately not
'  the place to put any: everything about launching the radio belongs in
'  the .cmd, which can be read and run on its own.
'
'  Argument 1, if there is one, is the browser to use. It is passed
'  straight through.
' ---------------------------------------------------------------------

Option Explicit
Dim sh, here, line, i

Set sh = CreateObject("WScript.Shell")

' The folder this file is in, trailing backslash included. The radio is
' opened from wherever this sits, so a copied or moved app folder needs
' no repair -- the same reason the .cmd uses %~dp0.
here = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))

line = Chr(34) & here & "Win - Open Deskside Radio.cmd" & Chr(34)
For i = 0 To WScript.Arguments.Count - 1
  line = line & " " & Chr(34) & WScript.Arguments(i) & Chr(34)
Next

' 0 = no window of any kind. False = do not wait for it: this exits at
' once, and the .cmd goes on waiting for the browser window by itself.
sh.Run line, 0, False
