DESKSIDE RADIO
==============

A radio for the corner of your computer desktop. It plays internet
streams from stations you choose, on a schedule if you want one, and it
looks like a radio rather than a browser tab.

It is a single web page. There is nothing to install, no account, no
server, and nothing is sent anywhere.


WHAT IS IN THIS FOLDER
----------------------

  index.html                   The radio itself. Everything is in here.
  Create Desktop Shortcut.cmd  Makes a proper Desktop shortcut (Windows).
  favicon-*.ico                One icon per theme, used by the shortcut.
  README.txt                   This file.

Keep the files together in one folder. You can put that folder anywhere:
Documents, OneDrive, a USB stick.


GETTING STARTED (WINDOWS)
-------------------------

1. Unzip this folder somewhere you will keep it.

2. Double-click "Create Desktop Shortcut.cmd".

   It puts "Deskside Radio" on your Desktop and tells you what it did.
   Windows may warn you about running a downloaded file; the script is
   plain text, so you can open it in Notepad and read it first.

3. Open the shortcut.

That is the whole install.

You can also just double-click index.html. It works, but you lose the two
things the shortcut adds, described next.


WHY USE THE SHORTCUT
--------------------

The shortcut opens the radio in a browser window of its own, with no
tabs, no address bar, and permission to start playing on its own.

That second part matters. Browsers refuse to play sound until you click
something, which is why a page opened normally always asks for one click
first. The shortcut lifts that restriction for this window only, so
"Play on launch" genuinely plays on launch.

It uses Chrome, or Edge if Chrome is not installed. If you have neither,
the shortcut still opens the radio in your normal browser, and you will
just click once to start it.

To give the shortcut a different theme's icon, run the script with that
theme's name:

  "Create Desktop Shortcut.cmd" console

Settings shows you the exact line to use for whichever theme you are on.


A NOTE ON THAT SEPARATE WINDOW
------------------------------

Because the shortcut uses a browser profile of its own, it starts with no
stations of yours in it. To carry your setup across:

  1. Open the radio the ordinary way and set it up how you like.
  2. Settings, Service, Export settings.
  3. Leave the downloaded deskside-radio-settings.json beside index.html.

The next launch reads it once and keeps its own settings from then on.
This is also how you set up a second machine.


OTHER PLATFORMS
---------------

On macOS and Linux, double-click or open index.html in Chrome, Edge or
Safari. Everything works except the Desktop shortcut script, which is
Windows-only. On macOS the app can hand you a .webloc file instead, from
the shortcut button next to Settings.


WHAT IT DOES
------------

Stations
  Add any internet radio stream by name, frequency, colour and URL.
  Or search for one: Settings has a finder that looks up stations by
  city and name through a free public directory, shows the call sign
  and whether it is AM, FM or internet-only, and adds it in one click.

Schedule
  Separate weekday and weekend time slots, each choosing a station. A
  slot hands over at its end time, so 07:00 to 10:00 runs until exactly
  10:00 and the next slot picks up there. Slots may run past midnight
  and may not overlap. A slot can also force the volume, bass, treble
  or theme when it starts.

Play on launch
  Turn it on, pick a station, and the radio starts by itself when you
  open the shortcut. An active schedule slot wins over it.

Seven themes
  Analogue dial      Walnut, brass, a lit glass scale and a real VU meter
  Broadcast console  Matte rack panel, amber readouts, segmented LEDs
  Rams minimal       Off-white, hairline rules, one orange marker
  Editorial          Type-led, a colour per station, a bank of level bars
  Retro 8-bit        Four colours, an 8px grid, a meter built from cells
  Departures board   Split-flap, one character per flap
  Marconi deco       Black lacquer and gold, with a gold VU meter

  Each theme brings its own Desktop icon.

Sound
  Volume runs on a proper decibel scale, so the middle of the slider is
  the middle of the range rather than everything happening at the top.
  Bass and treble are kept per station, since a talk station and a music
  station rarely want the same settings. Double-click any slider to put
  it back to the middle.

Meters
  A real VU meter with the ballistics of the mechanical article, fed
  from the actual audio rather than faked from the volume setting. Some
  streams refuse the access it needs, and the app says so rather than
  showing a meter that is guessing.

It keeps playing
  Streams drop. The radio watches for silence and dropped connections
  and reconnects on its own, backing off from two seconds to thirty, and
  returns to whatever the schedule says or the last station that worked.

Backup
  Settings, Service exports everything to one file and imports it back.


STREAM TYPES
------------

Paste any of these into a station's stream URL. The radio works out what
to do with it.

MP3 and AAC streams
  The ordinary kind, and what most Icecast and Shoutcast stations hand
  out. Everything works: sound, the meter, and the tone controls.

Playlist files (.pls and .m3u)
  Plenty of stations publish one of these as their "Listen" link. It is
  not a stream; it is a short text file with the real address inside it.
  The radio reads the file the first time you play that station, keeps
  the address it finds, and goes straight to it from then on. If the
  station's server refuses the request the file cannot be read, and the
  station will not play; open the file in a text editor and use the
  address from inside it instead.

HLS streams (.m3u8)
  These play, but they carry a longer delay by design, and stopping and
  starting one rewinds you ten to twenty seconds. The player is handed
  whole pre-recorded chunks and has to begin at the start of the newest
  one. There is no way around it from here. CBC Radio 1 is one of these.

.asx and .xspf
  Not handled. They are Windows Media and XML playlist formats. Open one
  in a text editor and use the stream address inside it.

Anything else
  If a link will not play, try it in a browser tab on its own. If the tab
  cannot play it either, neither can the radio.

A note on joining live
  A station sends a second or so of audio it has already broadcast the
  moment you connect, so the player has something to start on. The radio
  skips past it and joins at the live edge, which is why stopping and
  starting no longer repeats the last second. HLS stations are the
  exception, for the reason above.


YOUR DATA
---------

Everything lives in your browser's storage on this machine. No account,
no sign-in, nothing uploaded, no analytics.

Once a day the app checks a single file on GitHub to see whether a newer
version has been published, and says so in Settings if there is one. It
sends nothing about you, downloads nothing and installs nothing. The
switch beside it in Settings, Service turns that check off for good.


IF SOMETHING GOES WRONG
-----------------------

The meter says a stream blocks it
  Some stations refuse the cross-origin access the meter needs. The
  audio is fine; only the meter and the tone controls are unavailable
  for that station.

A station will not play
  Check the URL plays in a browser tab on its own. Some directory
  entries are playlist files rather than streams; the finder flags
  those before you add them.

Nothing plays until I click
  You opened index.html directly rather than the shortcut. See
  "Why use the shortcut" above.

Start again
  Settings, Service, Reset. It clears everything and restores the
  stations and settings a fresh copy starts with.


Deskside Radio is free and open source.
https://github.com/markticulous/deskside-radio
