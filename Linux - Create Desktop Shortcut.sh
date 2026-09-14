#!/usr/bin/env bash
# Deskside Radio - desktop entry, and optionally a start-on-login entry.
#
#   ./"Linux - Create Desktop Shortcut.sh"              install, dial icon
#   ./"Linux - Create Desktop Shortcut.sh" console      install, console icon
#   ./"Linux - Create Desktop Shortcut.sh" --autostart  also start on login
#   ./"Linux - Create Desktop Shortcut.sh" --off        remove both
#
# If it will not run, it needs the executable bit:  chmod +x "Linux - Create Desktop Shortcut.sh"
#
# What this writes, and nothing else:
#   ~/.local/share/applications/deskside-radio.desktop   the launcher entry
#   ~/.config/autostart/deskside-radio.desktop           only with --autostart
#
# Both are plain text files in your home directory. No root, no package, no
# service. Delete them by hand or run this with --off.
#
# On Linux, "start on login" is the desktop environment's own mechanism:
# GNOME, KDE, XFCE and Cinnamon all read ~/.config/autostart at session
# start. That is the same file format as the launcher, with one extra line,
# which is why one script does both.

set -u

APPDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$APPDIR/index.html"
APPS="$HOME/.local/share/applications"
AUTOSTART="$HOME/.config/autostart"
ENTRY="deskside-radio.desktop"

if [ ! -f "$TARGET" ]; then
  echo
  echo "  Could not find index.html next to this script."
  echo "  Keep this file in the Deskside Radio folder and run it again."
  echo
  exit 1
fi

# ---- off ---------------------------------------------------------------
THEME="dial"
WANT_AUTOSTART=0
for arg in "$@"; do
  case "$arg" in
    --off|--remove|off)
      rm -f "$APPS/$ENTRY" "$AUTOSTART/$ENTRY"
      command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" 2>/dev/null
      echo
      echo "  Removed the launcher and any start-on-login entry."
      echo
      exit 0
      ;;
    --autostart) WANT_AUTOSTART=1 ;;
    -*) echo "  Unknown option: $arg"; exit 1 ;;
    *) THEME="$arg" ;;
  esac
done

ICON="$APPDIR/favicon-$THEME.ico"
[ -f "$ICON" ] || { THEME="dial"; ICON="$APPDIR/favicon-dial.ico"; }

# ---- find a browser that can open a window of its own -------------------
# Chromium and its relatives take --app, which is what gives the radio a
# window with no tab strip above it. Firefox cannot do this: it dropped
# site-specific browsers, so it is the last resort rather than the first.
BROWSER=""
BROWSERNAME=""
for candidate in google-chrome google-chrome-stable chromium chromium-browser brave-browser vivaldi-stable microsoft-edge microsoft-edge-stable; do
  if command -v "$candidate" >/dev/null 2>&1; then
    BROWSER="$(command -v "$candidate")"
    BROWSERNAME="$candidate"
    break
  fi
done

# Flatpak versions, which are not on PATH as plain commands.
if [ -z "$BROWSER" ] && command -v flatpak >/dev/null 2>&1; then
  for app in com.google.Chrome org.chromium.Chromium com.brave.Browser com.microsoft.Edge; do
    if flatpak info "$app" >/dev/null 2>&1; then
      BROWSER="flatpak run $app"
      BROWSERNAME="$app (flatpak)"
      break
    fi
  done
fi

PROFILE="${XDG_DATA_HOME:-$HOME/.local/share}/deskside-radio/profile"
URL="file://$TARGET"

if [ -n "$BROWSER" ]; then
  EXEC="$BROWSER --app=\"$URL\" --autoplay-policy=no-user-gesture-required --window-size=1133,741 --user-data-dir=\"$PROFILE\" --no-first-run --no-default-browser-check"
else
  # Nothing Chromium-shaped: hand it to whatever opens an html file. The
  # radio still works, it just arrives in a tab and asks for one click
  # before it will play.
  EXEC="xdg-open \"$URL\""
  BROWSERNAME="your default browser"
fi

mkdir -p "$APPS"
cat > "$APPS/$ENTRY" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Deskside Radio
GenericName=Internet Radio
Comment=A desktop internet radio that looks like a radio
Exec=$EXEC
Icon=$ICON
Terminal=false
Categories=AudioVideo;Audio;Player;
Keywords=radio;stream;music;news;
StartupWMClass=deskside-radio
EOF
chmod +x "$APPS/$ENTRY"

command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" 2>/dev/null

echo
echo "  Launcher written: $APPS/$ENTRY"
echo "  Icon:             $THEME"
echo "  Opens with:       $BROWSERNAME"

if [ "$WANT_AUTOSTART" = "1" ]; then
  mkdir -p "$AUTOSTART"
  # The same entry plus the two lines a session manager looks for. The
  # delay gives the network a moment; a radio that starts before there is
  # one spends its first seconds reconnecting.
  {
    cat "$APPS/$ENTRY"
    echo "X-GNOME-Autostart-enabled=true"
    echo "X-GNOME-Autostart-Delay=8"
  } > "$AUTOSTART/$ENTRY"
  chmod +x "$AUTOSTART/$ENTRY"
  echo "  Start on login:   yes  ($AUTOSTART/$ENTRY)"
  echo
  echo "  For it to be playing when you sit down, turn on \"Play on launch\""
  echo "  in Settings and pick a station, or set up a schedule."
else
  echo
  echo "  To start it when you log in, run this again with --autostart."
fi

if [ -z "$BROWSER" ]; then
  echo
  echo "  No Chromium-based browser was found, so the radio will open in a"
  echo "  normal tab and ask for one click before it plays. Installing"
  echo "  Chromium or Chrome gets it a window of its own."
fi

echo
echo "  The launcher's own profile: $PROFILE"
echo "  It starts empty. To bring your stations across, export them from"
echo "  Settings - Service and leave deskside-radio-settings.js beside"
echo "  index.html; it is read once, the first time that profile opens."
echo
