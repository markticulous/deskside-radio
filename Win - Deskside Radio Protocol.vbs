' ---------------------------------------------------------------------
'  Deskside Radio - the one door from the page to the Startup folder.
'
'  The radio is a page opened from a disk. It can read what the launcher
'  writes down for it, which is how the Settings switch knows whether the
'  radio starts with Windows -- but a page has no way to put a shortcut
'  into the Startup folder, and no browser will ever give it one.
'
'  So the installer registers a protocol, desksideradio:, and the switch
'  navigates to it. Windows hands the whole URL to this file, and this
'  file runs "Win - Start with Windows (On-Off).cmd" with on or off.
'
'  WHY THIS FILE IS SO CAREFUL
'
'  A registered protocol is not private to the app that registered it.
'  Any page in any browser on this machine can navigate to
'  desksideradio:something and Windows will start this script with
'  whatever "something" is. Treating that text as a command would be
'  handing every website a way to run programs here.
'
'  It is therefore never treated as one. The text after the colon is
'  compared against exactly two words, and anything that is not one of
'  those two is dropped without a sound. Nothing from the URL is ever
'  passed on, concatenated into a command line, or used as a path: the
'  only thing that crosses from the URL into what runs is the choice
'  between two constants written below.
'
'  The worst a hostile page can therefore do is turn this radio's own
'  start-up entry on or off, which is a nuisance and not a foothold.
'
'  The browser asks before any of this the first time, naming the app,
'  with a box to stop asking. That is Windows and the browser doing
'  their job, and this file does not try to be clever about it.
' ---------------------------------------------------------------------

Option Explicit
Dim sh, here, url, verb, arg

If WScript.Arguments.Count < 1 Then WScript.Quit 0

url = LCase(Trim(WScript.Arguments(0)))

' The scheme, then the word. Browsers hand the URL over whole, and some
' of them add a trailing slash to one that has no path, so a slash is
' allowed for and thrown away. "desksideradio:" is fourteen characters,
' so the word starts at the fifteenth.
If Left(url, 14) <> "desksideradio:" Then WScript.Quit 0
verb = Mid(url, 15)
If Right(verb, 1) = "/" Then verb = Left(verb, Len(verb) - 1)
verb = Trim(verb)

' The allow-list, and the whole of it. Note what is NOT happening here:
' verb is not appended to anything. It selects one of two constants and
' is then finished with.
If verb = "startup-on" Then
  arg = "on"
ElseIf verb = "startup-off" Then
  arg = "off"
Else
  WScript.Quit 0
End If

Set sh = CreateObject("WScript.Shell")

' The folder this file is in, trailing backslash included -- the same
' reason the other scripts use %~dp0. A moved or copied app folder needs
' no repair, and the script that gets run is the one sitting beside this
' one rather than whichever copy the registry happened to be pointed at
' when it was written.
here = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))

' "You are being called": the switch script reads this and skips both its
' question and its closing keypress. Without it a hidden window would sit
' waiting for a key that nobody can press.
sh.Environment("PROCESS")("DESKSIDE_NOPAUSE") = "1"

' 0 = no window at all. True = wait, so that the page can read the new
' state as soon as the tab comes back to the front; the script it is
' waiting for writes one shortcut file and exits.
sh.Run Chr(34) & here & "Win - Start with Windows (On-Off).cmd" & Chr(34) & " " & arg, 0, True
