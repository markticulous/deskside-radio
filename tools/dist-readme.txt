DESKSIDE RADIO
==============

A radio for the corner of your computer desktop. It plays internet
streams from stations you choose, on a schedule if you want one, and it
looks like a radio rather than a browser tab.

It is a single web page. There is nothing to install, no account and no
server. Nothing about you is sent anywhere; the two things that do leave
your machine are the stations you play and, on each launch, a request to
Google Fonts for the typefaces. Both are listed under YOUR DATA below.


WHAT IS IN THIS FOLDER
----------------------

  index.html                                   The radio itself.
                                               Everything is in here.

  Win - Create Desktop Shortcut.cmd            Makes a Desktop shortcut.
  Win - Create Desktop Shortcut (Edge).cmd     The same, pinned to Edge.
  Win - Create Desktop Shortcut (Firefox).cmd  The same, pinned to Firefox.
  Win - Start With Windows.cmd                 Opens the radio at sign-in.
  Linux - Create Desktop Shortcut.sh           Both of those, for Linux.

  favicon-*.ico                                One icon per theme, used by
                                               the shortcut.
  README.txt                                   This file.
  LICENSE.txt                                  The MIT licence.

Anything starting "Win - " is for Windows and anything starting
"Linux - " is for Linux; on a Mac you make the shortcut from inside the
radio instead, with the button in the top bar.

Keep the files together in one folder. You can put that folder anywhere:
Documents, OneDrive, a USB stick.


GETTING STARTED (WINDOWS)
-------------------------

1. Unzip this folder somewhere you will keep it.

2. Double-click "Win - Create Desktop Shortcut.cmd".

   Use this rather than the shortcut button inside the radio. The button
   works, but a browser will not save a .url under its own name, so the
   file arrives called "Deskside Radio.download" and has to be renamed -
   and anything a browser downloads is tagged with where it came from.
   A page opened from your own disk has no address the tagger
   understands, so the file gets marked "restricted" and Windows asks
   "Do you want to open this file?" every single time.

   If you have already done it that way: right-click the file,
   Properties, tick Unblock, OK. That clears the mark for good.

   The helper has neither problem: it builds the shortcut on the spot
   instead of downloading it.

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

The window remembers where you put it. The first time, it sizes itself
to the radio; after that it opens at the size and in the place you last
closed it, including a size you set yourself by dragging the edge. Move
it to the corner of the screen you want it in and it will be there
tomorrow.

To give the shortcut a different theme's icon, run the script with that
theme's name:

  "Win - Create Desktop Shortcut.cmd" console

Settings shows you the exact line to use for whichever theme you are on.


A NOTE ON THAT SEPARATE WINDOW
------------------------------

Because the shortcut uses a browser profile of its own, it starts with no
stations of yours in it. To carry your setup across:

  1. Open the radio the ordinary way and set it up how you like.
  2. Settings, Service, Export settings.
  3. Leave the downloaded deskside-radio-settings.js beside index.html.

The next launch reads it once and keeps its own settings from then on.
This is also how you set up a second machine.


PICKING THE BROWSER, AND OTHER PLATFORMS
----------------------------------------

Win - Create Desktop Shortcut.cmd takes Chrome or Edge, whichever it finds
first. Three more scripts are here for when that is not the one you
want:

  Win - Create Desktop Shortcut (Edge).cmd
      Makes "Deskside Radio (Edge)", pinned to Edge.

  Win - Create Desktop Shortcut (Firefox).cmd
      Makes "Deskside Radio (Firefox)". Firefox has no app-window mode,
      so this opens an ordinary window with a tab strip; press F11 for
      fullscreen. Autoplay there is a preference rather than a flag, so
      the script writes it into the profile it creates.

  Linux - Create Desktop Shortcut.sh
      Writes a .desktop entry. Add --autostart to start it at login,
      or --off to remove both. If it will not run:
          chmod +x "Linux - Create Desktop Shortcut.sh"

Each shortcut has a browser profile of its own, so stations and settings
do not carry across between them. Export from Settings - Service to move
a setup from one to another.

On a Mac the shortcut is a .fileloc file. Drag it from Downloads to the
Desktop. If Finder refuses to open it, drag the address out of your
browser's address bar onto the Desktop instead - that always works.


STARTING WHEN YOU SIGN IN
-------------------------

Windows: double-click "Win - Start With Windows.cmd". It puts the same
shortcut in your Startup folder, and tells you where it put it. Run it
again with the word off to stop it:

  "Win - Start With Windows.cmd" off

Nothing is written to the registry and nothing runs in the background.
It is one file in a folder you can open yourself: press Win+R and enter
shell:startup.

For the radio to be playing when you sit down rather than just open,
turn on "Play on launch" in Settings and choose a station, or set up a
schedule.

macOS: use the shortcut button next to Settings to save a .webloc file
somewhere you will keep it, then open System Settings, General, Login
Items, and add that file under "Open at Login". It opens in your normal
browser, so it will ask for one click before it plays -- the trick the
Windows shortcut uses to skip that click is a Chrome command line, and
there is no equivalent to hand a login item.


OTHER PLATFORMS AND OTHER BROWSERS
----------------------------------

Chrome and Edge behave identically: Edge is built on the same engine,
the shortcut script uses it when Chrome is absent, and everything in
this readme was checked on both. If you are on a work machine with only
Edge, nothing is missing.

On macOS and Linux, open index.html in Chrome, Edge or Safari. The two
Windows scripts are Windows-only; on macOS the app can hand you a
.webloc file instead, from the shortcut button next to Settings.

Safari plays everything here, and handles HLS stations better than most.
Two things differ. Safari will not let a page opened from a file on disk
remember anything, so your stations and settings will not survive a
reload -- put the folder on a web server, or use Chrome or Edge, if that
matters to you. And the window does not size or place itself, because
that belongs to the shortcut and the shortcut is a Chrome one.


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

Eight themes
  Analogue dial      Walnut, brass, a lit glass scale and a real VU meter
  Broadcast console  Matte rack panel, a segment readout, segmented LEDs
  Rams minimal       Off-white, hairline rules, one orange marker
  Editorial          Type-led, a colour per station, a bank of level bars
  Retro 8-bit        Four colours, an 8px grid, a meter built from cells
  Departures board   Split-flap, one character per flap
  Marconi deco       Black lacquer and gold, with a gold VU meter
  Model One          A cherry cabinet and one big knob; the speaker is
                     the meter, and the cloth ripples with the level

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

  VU means Volume Unit, and a VU meter measures the level of the
  programme, not how loudly you are listening to it. The needle
  therefore does not follow the volume fader - that is deliberate, and
  it is what the meters on a broadcast console or a tape deck do. Turn
  the volume down and the needle keeps swinging, because the station is
  still as loud as it was. The meters that do follow a volume knob are
  the power meters on a hi-fi receiver, which is a different instrument.

  For the same reason the meter ignores the bass and treble controls:
  it is reading the station, not the room.

It keeps playing
  Streams drop. The radio watches for silence and dropped connections
  and reconnects on its own, backing off from two seconds to thirty, and
  returns to whatever the schedule says or the last station that worked.

Backup
  Settings, Service exports everything to one file and imports it back.


RECORDING
---------

Hold either Shift key and a small red REC button appears beside play.
Press it to start, press it again to stop. It stays visible while it is
recording whether you are holding Shift or not, and the dot on it blinks
so you can see at a glance that it is running. When you stop it, it turns
green and reads SAVED for a few seconds before it goes, so you know the
file was written.

The file lands in your Downloads folder, named for when it started and
how long it ran:

  DSRadio-260913191404-7.m4a      started 2026-09-13 19:14:04, ran 7 s

It is AAC in an .m4a file, about 96 kbps, which is roughly 45 MB an hour
and opens by double-click on Windows, macOS, a phone or a car stereo.

What is recorded is the broadcast, not what comes out of your speakers.
Turning the volume down, or dialling in bass for the room, changes what
you hear and not what lands in the file, so a recording made quietly is
not a quiet recording.

Two things it will not do. A station that cannot drive the meter cannot
be recorded either -- it is the same permission, and the button says so
rather than disappearing. And closing the window while it is still
recording loses that recording: press stop first.


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
  one. There is no way around that from here.

  What the radio does fix is the other HLS fault, which sounds worse:
  a few seconds in, the last several seconds play again. A station like
  CBC Radio 1 publishes a list of the same programme at several
  bitrates, twice over, on two different delivery networks. Browsers
  start on the lowest bitrate and step up once they have measured the
  connection, and the step up can land on the other network, whose copy
  is a few seconds behind -- so you hear those seconds twice. The radio
  reads that list itself and hands the browser one entry, the best one,
  so there is nothing for it to switch to. It also means you get the
  full bitrate from the first second instead of the tenth.

  If the connection cannot carry that entry, the radio steps down the
  list a rung at a time as it retries, and goes back to the top once
  the stream has held for ten seconds.

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

The page asks Google Fonts for its typefaces each time it opens, which
tells Google an anonymous request came from your address, the same as any
web page using a hosted font. Playing a station tells that station the
same. Nothing else leaves the machine.

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
