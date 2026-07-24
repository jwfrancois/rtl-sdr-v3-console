"""
Chapters 1-5: Intro, Install, UI Tour, Tuning, Hardware Setup.
Appended to sdr-doc.py via import.
"""

from reportlab.lib.units import mm
from sdr_doc import (
    mm,
    h1, h2, h3, body, code, callout, tip, warning, hr, make_table,
    PageBreak, Paragraph, Spacer, MONO_FONT,
)

def chapter1():
    return [
        PageBreak(),
        h1("Chapter 1: Introduction &amp; Quick Start"),
        body(
            "The <b>RTL-SDR V3 Console</b> is a high-definition web application for "
            "software-defined radio. Built with Next.js, TypeScript, and the Web Audio API, "
            "it transforms the popular RTL-SDR V3 USB dongle into a complete radio "
            "workstation with spectrum analysis, waterfall display, multiple demodulators, "
            "and decoders for aircraft, weather satellites, pagers, GPS, and more. The app "
            "runs entirely in a browser, with an optional WebSocket bridge that connects "
            "to your physical hardware through the standard <font name='%s'>rtl_tcp</font> daemon." % MONO_FONT
        ),
        body(
            "What sets this console apart from other SDR software is its dual-mode architecture: "
            "it ships with a fully-functional <b>simulated SDR engine</b> that synthesizes realistic "
            "spectrum data and audio for 29 stations across the FM, airband, marine, NOAA, ham, and "
            "shortwave bands. This means you can explore every feature, learn how to tune, and "
            "experiment with decoders without any hardware at all. When you are ready to receive "
            "real signals, a one-click toggle switches the app to your physical RTL-SDR V3 dongle "
            "via the bridge script, and the same UI now displays live RF from your antenna."
        ),
        h2("Two Operating Modes"),
        body(
            "The console supports two backends that you can switch between at any time using the "
            "Hardware Source panel in the top-left of the screen:"
        ),
        h3("Simulated Mode (default)"),
        body(
            "The simulated SDR engine runs entirely in your browser. It generates believable spectrum "
            "data with station peaks, noise floor, ionospheric fading on HF frequencies, and per-bin "
            "Gaussian noise. The Web Audio synthesizer produces station-appropriate audio: layered "
            "chord music for FM broadcast stations, filtered noise for voice-like stations, keyed "
            "tones for CW/morse, alternating FSK for data stations, and so on. This mode is perfect "
            "for learning the UI, demonstrating the app, or testing features without any hardware."
        ),
        h3("Real Hardware Mode"),
        body(
            "When you switch to real mode, the app connects to a WebSocket bridge running on your "
            "PC. The bridge wraps <font name='%s'>rtl_tcp</font> and forwards raw IQ samples to the "
            "browser, where they are processed by the same FFT, demodulators, and decoders. Every "
            "frequency change, gain adjustment, or demodulator switch is sent back to the bridge and "
            "applied to the hardware in real time. You hear real broadcast audio, see real aircraft "
            "on the radar plot, and decode real RDS data from local FM stations." % MONO_FONT
        ),
        h2("Quick Start: 5 Minutes to Live Audio"),
        body(
            "If you just want to hear something right now, follow these steps. No hardware required."
        ),
        h3("Path A: Simulated Mode (no hardware)"),
        body(
            "1. Open the app in your browser (the preview URL is shown in the development environment).<br/>"
            "2. The app starts in simulated mode by default, tuned to 91.5 MHz in WFM mode.<br/>"
            "3. Click the <b>AUDIO ON</b> button in the transport bar (next to START/STOP).<br/>"
            "4. You will hear synthesized jazz music from the Jazz Horizon station.<br/>"
            "5. Click different frequencies in the spectrum or use the digit tuner (left panel) to "
            "switch stations. Each station type plays different audio."
        ),
        tip(
            "Try clicking on the spectrum at 127.2 MHz (AM mode) to hear simulated air traffic control, "
            "or 162.4 MHz (NFM) for NOAA weather radio. Each station has a different audio character."
        ),
        h3("Path B: Real Hardware Mode"),
        body(
            "Connecting real hardware takes about 10 minutes if you have Node.js installed. The full "
            "setup is covered in Chapter 5; here is the short version:"
        ),
        code(
            "# Terminal 1 - talk to the dongle\n"
            "sudo rtl_tcp -s 2400000\n\n"
            "# Terminal 2 - run the bridge (download from the app)\n"
            "cd ~/sdr-bridge\n"
            "npm install\n"
            "npm start\n\n"
            "# In the web app:\n"
            "# 1. Click 'Real RTL-SDR' in the Hardware Source panel (top-left)\n"
            "# 2. Wait for status to flip to 'LIVE HW' (about 1 second)\n"
            "# 3. Click AUDIO ON to hear real broadcast audio"
        ),
        body(
            "If the bridge shows <font name='%s'>rtl_tcp handshake OK</font>, you are connected. "
            "The spectrum will now show real RF from your antenna instead of simulated data." % MONO_FONT
        ),
        h2("Browser Requirements"),
        body("The console uses modern Web APIs that require a recent browser:"),
        make_table(
            ["Feature", "API", "Minimum Browser"],
            [
                ["WebSocket client", "WebSocket API", "All modern browsers"],
                ["Real-time FFT canvas", "Canvas 2D + requestAnimationFrame", "Chrome 60+, Firefox 55+, Safari 11+"],
                ["Audio synthesis", "Web Audio API", "Chrome 60+, Firefox 55+, Safari 14+"],
                ["High-DPI rendering", "devicePixelRatio", "All modern browsers"],
                ["Pointer events", "Pointer Events API", "Chrome 55+, Firefox 59+, Safari 13+"],
            ],
            col_widths=[55*mm, 50*mm, 65*mm],
        ),
        body(
            "Mobile browsers work but the layout is condensed. The app is optimized for desktop use "
            "with a screen width of at least 1280 pixels. For the best experience, use a recent "
            "version of Chrome, Firefox, or Edge on a desktop or laptop."
        ),
        warning(
            "Browsers block insecure WebSocket (ws://) connections from secure HTTPS pages, with one "
            "exception: ws://localhost and ws://127.0.0.1 are always allowed. If you are running the "
            "cloud preview and want to access the dongle on a different PC, you need to start the "
            "bridge with the --tls flag for wss:// support. See Chapter 5 for details."
        ),
    ]

def chapter2():
    return [
        PageBreak(),
        h1("Chapter 2: Installing &amp; Running the App"),
        body(
            "This chapter covers everything you need to run the RTL-SDR V3 Console on your own "
            "machine. The app is a standard Next.js 16 project, so it runs on any operating system "
            "with Node.js 18 or later. You can run it locally for development, or deploy it to any "
            "static hosting provider that supports Next.js (Vercel, Netlify, Cloudflare Pages)."
        ),
        h2("Prerequisites"),
        body("Before you begin, make sure you have the following installed:"),
        make_table(
            ["Tool", "Version", "Purpose"],
            [
                ["Node.js", "18.0 or later", "JavaScript runtime for the dev server"],
                ["npm or bun", "npm 9+ / bun 1.0+", "Package manager"],
                ["Git", "any recent version", "Clone the repository"],
                ["RTL-SDR drivers", "rtl-sdr 0.6+", "Only needed for real hardware mode"],
            ],
            col_widths=[40*mm, 35*mm, 95*mm],
        ),
        body(
            "If you plan to use real-hardware mode, you also need the RTL-SDR package installed "
            "on your system, which provides the <font name='%s'>rtl_tcp</font> daemon. Installation "
            "instructions for macOS, Linux, and Windows are in Chapter 5." % MONO_FONT
        ),
        h2("Cloning the Repository"),
        body("The full source code is available on GitHub. Clone it to your local machine:"),
        code(
            "git clone https://github.com/jwfrancois/rtl-sdr-v3-console.git\n"
            "cd rtl-sdr-v3-console"
        ),
        body(
            "The repository contains the complete application: the Next.js app in <font name='%s'>src/</font>, "
            "the standalone bridge script in <font name='%s'>download/sdr-bridge/</font>, and "
            "documentation in the README. The bridge is also served from <font name='%s'>public/download/sdr-bridge/</font> "
            "so it can be downloaded directly from the running app." % (MONO_FONT, MONO_FONT, MONO_FONT)
        ),
        h2("Installing Dependencies"),
        body("Install the JavaScript dependencies using your preferred package manager:"),
        code(
            "# Using npm (default)\n"
            "npm install\n\n"
            "# Or using bun (faster, recommended)\n"
            "bun install"
        ),
        body(
            "This will install Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, the shadcn/ui "
            "component library, Zustand for state management, and all other dependencies. The install "
            "takes about 30 seconds with npm or 10 seconds with bun."
        ),
        h2("Starting the Dev Server"),
        body("Run the development server:"),
        code(
            "npm run dev    # or: bun run dev\n\n"
            "# The app starts on http://localhost:3000\n"
            "# Open this URL in your browser to see the console"
        ),
        body(
            "The first time you load the page, Next.js will compile the project (this takes a few "
            "seconds). Subsequent loads are instant thanks to Turbopack. The app starts in simulated "
            "mode by default, so you should immediately see a spectrum with simulated stations and "
            "be able to click around to explore."
        ),
        h2("Project Structure Overview"),
        body("Understanding the project layout helps if you want to extend the app or contribute:"),
        code(
            "rtl-sdr-v3-console/\n"
            "  src/\n"
            "    app/                  Next.js App Router\n"
            "      globals.css         Dark theme, glassmorphic panels\n"
            "      layout.tsx          Root layout + font setup\n"
            "      page.tsx            Main dashboard page\n"
            "    components/\n"
            "      ui/                 shadcn/ui components\n"
            "      sdr/                SDR-specific panels\n"
            "        spectrum-analyzer.tsx\n"
            "        waterfall-display.tsx\n"
            "        frequency-tuner.tsx\n"
            "        ... (20+ panel components)\n"
            "    lib/\n"
            "      sdr-engine.ts       Simulated SDR engine\n"
            "      sdr-store.ts         Zustand state store\n"
            "      sdr-audio.ts        Web Audio synth + real audio\n"
            "      real-sdr/\n"
            "        types.ts           Protocol types\n"
            "        dsp.ts             FFT, biquads, decimation\n"
            "        demodulators.ts    FM/AM/SSB/CW\n"
            "        rds.ts             RDS decoder\n"
            "        adsb.ts             ADS-B Mode S decoder\n"
            "        apt.ts              NOAA APT decoder\n"
            "        meteor.ts           Meteor M2 LRPT\n"
            "        goes-hrit.ts        GOES HRIT\n"
            "        inmarsat-stdc.ts   Inmarsat STD-C\n"
            "        gps-l1.ts           GPS L1 C/A\n"
            "        pocsag.ts           POCSAG pagers\n"
            "        acars.ts            ACARS aircraft messaging\n"
            "        hd-radio.ts         HD Radio SIS\n"
            "        notch-filter.ts     Notch filter\n"
            "  download/sdr-bridge/      Standalone bridge script\n"
            "  prisma/                   Database (unused by default)\n"
            "  public/                   Static assets"
        ),
        h2("Building for Production"),
        body("To create a production build (faster page loads, smaller bundle):"),
        code(
            "npm run build\n"
            "npm run start    # serves the built app on port 3000"
        ),
        body(
            "The production build is optimized and minified. You can deploy the built app to any "
            "Next.js-compatible host. Vercel is the easiest - just push to GitHub and connect your "
            "repo on vercel.com, and Vercel will deploy automatically on every commit."
        ),
    ]

def chapter3():
    return [
        PageBreak(),
        h1("Chapter 3: The User Interface Tour"),
        body(
            "The console uses a three-column dashboard layout designed to fit a 1280-pixel-wide "
            "screen comfortably. On narrower screens the columns stack vertically. Each panel "
            "addresses a specific function, and most panels become important only after you switch "
            "to real-hardware mode and tune to the right frequency band. This chapter walks through "
            "every panel and what it does."
        ),
        h2("Top Header (Status Bar)"),
        body(
            "Across the top of the page, the status header shows live system information: the active "
            "frequency in large monospace text, the active station name (if you are tuned to a known "
            "frequency), the band name (FM Broadcast, Airband, Marine VHF, etc.), the current demod "
            "mode, the sample rate in Msps, the tuner gain, the PPM correction, the SNR estimate, "
            "and the system clock with uptime. On the right are status badges that show SDR ON/OFF, "
            "AUDIO ON/MUTED, and REC/IDLE states."
        ),
        h2("Left Column: Controls"),
        h3("Hardware Source Panel"),
        body(
            "At the very top of the left column, this panel lets you switch between the simulated "
            "engine and your real RTL-SDR hardware. The two-button toggle selects the backend; "
            "below it, the bridge URL field lets you point the app at a bridge running on another "
            "machine. When connected to real hardware, the panel shows live stats: device name "
            "(typically RTL-SDR V3 R820T2), uptime, current hardware frequency, sample rate, gain, "
            "and any buffer overruns. A green LIVE HW badge indicates a healthy connection."
        ),
        h3("Frequency Tuner"),
        body(
            "Below the connection panel is the VFO (Variable Frequency Oscillator) tuner. The "
            "frequency is shown as large monospace digits grouped by GHz, MHz, kHz, and Hz. Each "
            "digit is individually clickable: left-click increments that digit, right-click "
            "decrements it. Below the digits are Up/Down buttons that tune by the selected step "
            "size (10 Hz to 1 MHz). Six quick-band preset buttons let you jump to common frequencies "
            "with the correct demodulator mode and bandwidth pre-configured."
        ),
        h3("Demodulator Controls"),
        body(
            "Seven demodulator mode buttons let you select WFM, NFM, AM, USB, LSB, CW, or RAW. "
            "Below the mode buttons are bandwidth presets appropriate to the selected mode. For "
            "example, WFM offers 180 kHz through 240 kHz (broadcast FM channel widths); NFM offers "
            "12.5 kHz through 30 kHz (VHF/UHF voice channel widths); AM offers 6 kHz through 16 kHz "
            "(suitable for airband and shortwave broadcast). The selected bandwidth is shown as "
            "amber dashed lines on the spectrum display, indicating the receiver filter window."
        ),
        h3("RF &amp; Audio Panel"),
        body(
            "This panel controls the radio frequency chain: tuner gain (0-50 dB or Auto), sample "
            "rate (eight presets from 240 ksps to 3.2 Msps), squelch threshold (0-100 percent), "
            "audio volume, PPM correction (-100 to +100), and AGC speed (slow, medium, fast). The "
            "AGC checkbox toggles between manual gain control (where you set the dB value) and "
            "automatic gain control (where the dongle's AGC circuit adjusts gain to maintain a "
            "constant output level)."
        ),
        h3("Notch Filter Panel"),
        body(
            "The notch filter lets you suppress strong interfering signals in the IQ stream before "
            "demodulation. This is most useful when a strong local FM station is swamping your "
            "dongle's front end and preventing you from hearing weaker signals. The Auto-detect "
            "toggle continuously scans the spectrum for bins 25 dB above the noise floor and "
            "automatically adds notches at those frequencies. You can also add manual notches by "
            "entering a frequency offset in Hz and clicking the + button. The active notch list "
            "shows each notch with its frequency offset, Q factor, and an auto/manual badge."
        ),
        h3("Scanner Panel"),
        body(
            "The scanner automates signal discovery. Three modes are available: Peak scan finds "
            "the strongest signal in the current spectrum view and tunes to it every 800 ms. Sweep "
            "scan moves through a band in 70 percent sample-rate steps, collecting every signal "
            "above -60 dBFS into a sorted list. Squelch scan steps through a band in channel-sized "
            "increments, stops for 3 seconds on each signal above the squelch threshold, then "
            "continues. Nine band presets cover FM broadcast, airband, 2m ham, NOAA weather, "
            "marine VHF, 70cm ham, GMRS, shortwave, and CB radio. Found signals are listed with "
            "frequency and signal strength; click any entry to tune back to it."
        ),
        h2("Center Column: Visualization"),
        h3("Transport Bar"),
        body(
            "The transport bar sits at the top of the center column. It contains the START/STOP "
            "button (controls whether the SDR is producing IQ data), the AUDIO ON/OFF button "
            "(starts the Web Audio context and routes demodulated audio to your speakers), the "
            "master volume slider, the REC button (toggles IQ recording on the bridge), and a "
            "squelch indicator that shows SQL OPEN (signal above threshold) or SQL CLOSED (signal "
            "below threshold). When real audio is being received and played, an additional "
            "activity meter appears showing the peak audio amplitude and the audio frame rate."
        ),
        h3("Spectrum Analyzer"),
        body(
            "The HD spectrum analyzer shows the magnitude spectrum of the current IQ stream in "
            "real time. The X axis is frequency (labeled in MHz, kHz, or Hz depending on the "
            "span); the Y axis is dBFS, ranging from -100 to 0. A glowing cyan line shows the "
            "instantaneous spectrum, a yellow peak-hold line shows recent peak values, and a "
            "gradient fill under the curve gives a visual sense of signal strength. The amber "
            "dashed lines indicate the demodulator filter bandwidth, and the yellow triangle at "
            "the top marks the tuned center frequency. You can click anywhere on the spectrum to "
            "tune to that frequency instantly."
        ),
        h3("Waterfall Display"),
        body(
            "Below the spectrum, the waterfall display scrolls downward over time, showing the "
            "history of the spectrum as a color-coded image. The Viridis colormap runs from dark "
            "purple (low signal) through blue, teal, green, yellow, and finally bright yellow "
            "(strong signal). The waterfall's vertical axis is time, with the most recent data at "
            "the top. This display is invaluable for spotting transient signals: an aircraft "
            "transponder burst appears as a brief streak, while a continuous FM station appears "
            "as a solid vertical line. The filter bandwidth and center frequency markers carry "
            "over from the spectrum above."
        ),
        h3("Signal Meter (S-Meter)"),
        body(
            "The S-meter shows the current signal strength on a traditional S0 through S9+60 dB "
            "scale, with a green-yellow-orange-red gradient bar. The squelch threshold is shown "
            "as a red dashed marker. This mimics the S-meter on a traditional communications "
            "receiver: S9 corresponds to approximately -73 dBm, and each S-unit is 6 dB. The "
            "meter is useful for comparing antenna positions or for confirming that a signal is "
            "above the squelch threshold."
        ),
        h3("Audio Oscilloscope"),
        body(
            "The audio oscilloscope shows the frequency-domain representation of the demodulated "
            "audio output. When audio is enabled and the SDR is producing real audio frames, you "
            "see the spectrum of what you are hearing - typically a peak at the dominant audio "
            "frequency. This is useful for verifying that the demodulator is producing audio and "
            "for spotting interference or distortion in the audio chain."
        ),
        h3("Decoder Panels (auto-show)"),
        body(
            "Below the signal meter, additional decoder panels appear automatically when you tune "
            "to the right frequency band. The ADS-B tracker appears at 1090 MHz with a radar-style "
            "polar plot of decoded aircraft. The APT weather satellite panel appears at 137-138 "
            "MHz (when not on a NOAA APT frequency), showing the live image as it is decoded. "
            "GOES HRIT, Inmarsat STD-C, Meteor M2, and GPS L1 panels appear at their respective "
            "frequencies. See Chapters 8 through 17 for decoder-specific details."
        ),
        h2("Right Column: Stations &amp; Recording"),
        h3("Active Station Card"),
        body(
            "This card shows information about the station currently tuned (in simulated mode) or "
            "the strongest signal under the cursor (in real mode). It displays the station name, "
            "band, modulation, bandwidth, and description, along with a live signal strength "
            "percentage, the exact tuned frequency, and the current demod mode. An animated radio "
            "wave backdrop adds visual interest."
        ),
        h3("IQ Recording Panel"),
        body(
            "When connected to real hardware, this panel lets you record raw IQ data to disk on "
            "the bridge. The big RECORD/STOP button toggles recording; live stats show duration, "
            "file size, and write rate in MB/s. Below the active recording stats, a list of saved "
            "recordings appears with size, timestamp, and a download link. Files are saved as "
            "raw unsigned 8-bit IQ (.raw), compatible with SDR#, GQRX, and GNU Radio."
        ),
        h3("Audio WAV Recorder"),
        body(
            "Below the IQ recording panel, the audio WAV recorder captures the demodulated audio "
            "as a 16-bit PCM WAV file directly in the browser. This is useful for capturing a "
            "quick clip of what you are hearing without dealing with raw IQ data. The RECORD "
            "AUDIO button starts capture; clips are listed with duration, file size, download "
            "link, and delete button."
        ),
        h3("Decoded Messages Panel"),
        body(
            "This panel shows decoded POCSAG pager messages and ACARS aircraft messaging. The "
            "tab toggle switches between Pagers and ACARS views. Pager messages are tagged "
            "NUM (numeric), ALN (alphanumeric), or TON (tone-only) with the pager address and "
            "message text. ACARS messages show the flight ID, aircraft registration, message "
            "label, message number, and text body. The panel auto-switches to the appropriate "
            "tab when you tune to a pager band (929-932 MHz) or ACARS band (131-132 MHz)."
        ),
        h3("Memory Bank (Bookmarks)"),
        body(
            "The memory bank has three tabs: Stations, Bookmarks, and History. The Stations tab "
            "lists 29 pre-configured real-world frequencies grouped by band (FM Broadcast, "
            "Airband, Marine VHF, Weather, Ham Radio, Shortwave, etc.) with a search field to "
            "filter by name, band, or frequency. The Bookmarks tab lets you save the current "
            "frequency/demod/bandwidth combination for later recall. The History tab lists up "
            "to 24 recently tuned frequencies. When connected to real hardware, cloud icons in "
            "the panel header let you push your bookmarks to the bridge or pull them on another "
            "device, enabling cross-device bookmark sync."
        ),
        h2("Floating Elements"),
        h3("RDS / HD Radio Overlays"),
        body(
            "When tuned to a broadcast FM station in WFM mode, two overlay cards appear on top of "
            "the spectrum panel. The RDS overlay (top-right) shows the station's PS name (the "
            "8-character name you see on a car radio display), PI code, PTY (program type), "
            "Radio Text, and other RDS data. The HD Radio overlay (top-left) shows similar data "
            "from HD Radio SIS: call letters, slogan, FCC facility ID, ALFN (GPS-locked time), "
            "and audio service code. Both overlays require real hardware and a strong FM signal."
        ),
        h3("Keyboard Shortcuts Button"),
        body(
            "A small keyboard icon floats in the bottom-right corner of the viewport. Click it "
            "(or press the ? key) to open the keyboard shortcuts help overlay. See Chapter 22 "
            "for the complete shortcut reference."
        ),
        h3("Fullscreen Spectrum Mode"),
        body(
            "Click the maximize icon in the top-right corner of the spectrum panel to enter "
            "fullscreen mode. The spectrum grows to 300 pixels tall and the waterfall to 400 "
            "pixels, both spanning the full viewport width. The RDS overlay continues to show "
            "in the top-right. Press ESC or click the EXIT button to leave. This mode is "
            "useful for monitoring a band for an extended period or for demonstrations."
        ),
    ]

def chapter4():
    return [
        PageBreak(),
        h1("Chapter 4: Tuning &amp; Demodulation"),
        body(
            "This chapter covers the fundamental operations of any SDR: tuning to a frequency and "
            "selecting the right demodulator. The RTL-SDR V3 Console provides multiple ways to "
            "tune, each suited to different use cases, and seven demodulator modes that cover the "
            "vast majority of signals you will encounter between 24 kHz and 1.75 GHz."
        ),
        h2("Ways to Tune"),
        h3("Digit-by-Digit Tuning"),
        body(
            "The frequency tuner in the left column shows the current frequency as 12 monospace "
            "digits grouped as GGG.MMM.kkk.HHH (gigahertz, megahertz, kilohertz, hertz). Each "
            "digit is independently clickable: hover over a digit to reveal small up/down arrows, "
            "or simply click the digit itself to increment it by one (right-click decrements). "
            "This is the most precise way to tune and is ideal for entering an exact frequency "
            "from a list."
        ),
        h3("Step Up/Down Buttons"),
        body(
            "Below the digits are UP and DOWN buttons that tune by the selected step size. The "
            "step size is shown in a dropdown between the buttons, with eight options: 10 Hz, "
            "100 Hz, 1 kHz, 5 kHz, 12.5 kHz, 25 kHz, 100 kHz, and 1 MHz. The 12.5 kHz and 25 kHz "
            "steps correspond to common VHF/UHF voice channel spacing, while 100 kHz is useful "
            "for scanning the FM broadcast band. Use the keyboard arrow keys (up/down) to step "
            "quickly without reaching for the mouse."
        ),
        h3("Click on Spectrum or Waterfall"),
        body(
            "The fastest way to explore a band is to click directly on the spectrum or waterfall "
            "display. The X position of your click is mapped to a frequency, and the app tunes "
            "there instantly. You can also drag (hold the mouse button down and move) to scrub "
            "across the band. As you hover, the current cursor frequency is shown in the panel "
            "header. This is the recommended way to find unknown signals."
        ),
        h3("Quick Band Presets"),
        body(
            "Below the step buttons are six quick-band preset buttons: FM (96.5 MHz WFM), Airband "
            "(127.2 MHz AM), Marine (156.8 MHz NFM), NOAA (162.4 MHz NFM), 20m Ham (14.2 MHz USB), "
            "and WWV (10 MHz AM). Each preset tunes to a representative frequency in that band and "
            "configures the demodulator mode and bandwidth appropriately. Use these as starting "
            "points for exploring each band."
        ),
        h3("Memory Bank Stations List"),
        body(
            "The Stations tab in the right column lists 29 real-world frequencies grouped by band. "
            "Each entry shows the station name, description, modulation, and exact frequency. "
            "Clicking any entry tunes to it with the correct demod and bandwidth. Use the search "
            "field to filter by name, band, or frequency. This is the fastest way to jump to a "
            "specific known signal."
        ),
        h2("Demodulator Modes"),
        body(
            "The RTL-SDR V3 Console supports seven demodulator modes, each suited to a specific "
            "class of signal. Selecting the wrong mode will produce garbled or silent audio. The "
            "following table summarizes when to use each mode."
        ),
        make_table(
            ["Mode", "Typical Use", "Bandwidth", "Audio Cutoff"],
            [
                ["WFM", "Broadcast FM (87.5-108 MHz)", "180-240 kHz", "15 kHz"],
                ["NFM", "VHF/UHF voice (marine, ham, NOAA)", "12.5-30 kHz", "3 kHz"],
                ["AM", "Airband, shortwave broadcast", "6-16 kHz", "4 kHz"],
                ["USB", "HF ham radio voice (above 10 MHz)", "2.4-3.5 kHz", "3 kHz"],
                ["LSB", "HF ham radio voice (below 10 MHz)", "2.4-3.5 kHz", "3 kHz"],
                ["CW", "Morse code", "300-1000 Hz", "800 Hz tone"],
                ["RAW", "Magnitude output (for decoders)", "240 kHz - 2 MHz", "varies"],
            ],
            col_widths=[18*mm, 55*mm, 35*mm, 62*mm],
        ),
        h3("WFM (Wide FM)"),
        body(
            "WFM demodulates broadcast FM signals with 75 kHz deviation and a 15 kHz audio "
            "cutoff. The demodulator differentiates the phase of each IQ sample to recover the "
            "instantaneous frequency, then normalizes by the expected deviation. A 75 microsecond "
            "de-emphasis filter (2122 Hz cutoff) compensates for the pre-emphasis applied at the "
            "transmitter, restoring flat frequency response. The audio is then decimated to 48 kHz "
            "for playback. Use WFM for any signal in the 87.5-108 MHz broadcast band."
        ),
        h3("NFM (Narrow FM)"),
        body(
            "NFM handles narrowband FM signals with 5 kHz deviation and 3 kHz audio cutoff. The "
            "demodulator is identical to WFM but uses a smaller deviation value and a tighter "
            "audio low-pass filter. Use NFM for VHF/UHF voice communications: marine VHF "
            "(156-162 MHz), NOAA weather radio (162.4-162.55 MHz), 2m and 70cm ham radio, GMRS, "
            "and business band radios."
        ),
        h3("AM (Amplitude Modulation)"),
        body(
            "AM demodulates by computing the magnitude of each complex IQ sample, then subtracting "
            "a slowly-tracked DC average to remove the carrier. The result is the audio envelope. "
            "A low-pass filter at 4 kHz removes high-frequency noise and the carrier residual. Use "
            "AM for the aircraft band (118-137 MHz), shortwave broadcast (2-30 MHz), and time "
            "signal stations like WWV (2.5, 5, 10, 15, 20 MHz)."
        ),
        h3("USB / LSB (Single Sideband)"),
        body(
            "Single-sideband demodulation uses the phasing method: the IQ signal is mixed with a "
            "cosine and sine wave at a small offset frequency (500 Hz BFO), and the result is "
            "low-pass filtered to remove the unwanted sideband. USB keeps the upper sideband "
            "(frequencies above the carrier); LSB keeps the lower sideband. Use USB for ham "
            "voice above 10 MHz (20m, 15m, 10m bands); use LSB for ham voice below 10 MHz (80m, "
            "40m bands). The 500 Hz BFO shifts the audio into the audible range so you hear a "
            "natural-sounding voice instead of DC."
        ),
        h3("CW (Continuous Wave / Morse)"),
        body(
            "CW demodulation extracts the magnitude envelope of the signal, then mixes it with a "
            "700 Hz BFO (beat frequency oscillator) to produce an audible tone whenever the carrier "
            "is present. A bandpass filter from 500 Hz to 900 Hz removes noise outside the tone "
            "frequency. Use CW when receiving Morse code signals in the ham bands (typically "
            "around 14.0-14.070 MHz for 20m CW, but you can find CW activity in all ham bands)."
        ),
        h3("RAW"),
        body(
            "RAW mode does not demodulate - it outputs the magnitude of the IQ stream directly. "
            "This is useful for decoders that need the raw baseband signal, such as ADS-B "
            "(aircraft transponders at 1090 MHz use a 1 Mbps PPM modulation that requires "
            "magnitude-domain processing). RAW output is rarely useful for human listening but "
            "is essential for the ADS-B and other specialized decoders."
        ),
        h2("Bandwidth Selection"),
        body(
            "Each demodulator mode has a set of appropriate bandwidth presets. The bandwidth "
            "determines the receiver filter width - signals within this window are demodulated; "
            "signals outside are attenuated. A wider bandwidth captures more of the signal but "
            "also more noise; a narrower bandwidth rejects adjacent-channel interference but may "
            "truncate the audio. As a rule of thumb: match the bandwidth to the signal. Broadcast "
            "FM uses 180 kHz; narrow FM voice uses 12.5 or 25 kHz; AM broadcast uses 10 kHz; "
            "SSB voice uses 2.4 or 3 kHz."
        ),
        body(
            "The selected bandwidth is visualized on the spectrum as amber dashed lines, showing "
            "exactly which portion of the spectrum is being demodulated. This is helpful when "
            "adjusting bandwidth to match an unknown signal - widen until the audio sounds clear, "
            "then narrow until just before the audio quality degrades."
        ),
        h2("Gain Control"),
        body(
            "The tuner gain controls how much the RTL-SDR's R820T2 tuner amplifies the incoming "
            "RF signal before digitization. There are 29 gain steps from 0 to 49.6 dB. Higher gain "
            "lets you hear weaker signals but also amplifies noise; lower gain reduces noise but "
            "may miss weak signals. The right setting depends on your antenna, the band, and "
            "local interference levels."
        ),
        h3("AGC (Automatic Gain Control)"),
        body(
            "When AGC is enabled (checkbox in the RF &amp; Audio panel), the tuner automatically "
            "adjusts gain to maintain a constant output level. This is convenient for general "
            "listening but can cause gain pumping on strong signals (the gain drops when a strong "
            "signal appears, then rises when it disappears, modulating the background noise). For "
            "weak-signal work or when comparing signals, disable AGC and set gain manually."
        ),
        h3("Manual Gain Tips"),
        body(
            "Start with AGC on to find the band. Once you have a signal of interest, disable AGC "
            "and increase gain until the noise floor rises noticeably on the spectrum (typically "
            "around 30-40 dB). Then back off 5 dB to leave headroom for signal peaks. If you see "
            "clipping (the spectrum hits 0 dBFS frequently), reduce gain. If the noise floor is "
            "below -90 dBFS, you can safely increase gain."
        ),
        h2("PPM Correction"),
        body(
            "The RTL-SDR V3's crystal oscillator has a typical accuracy of ±50 PPM (parts per "
            "million), meaning the actual sample rate and tuned frequency can be off by up to "
            "±50 Hz per MHz of frequency. At 100 MHz, that is ±5 kHz - enough to noticeably shift "
            "the pitch of demodulated audio. The PPM correction slider lets you compensate for "
            "this error."
        ),
        body(
            "To calibrate PPM: tune to a known exact frequency (e.g. a local FM station's licensed "
            "frequency from the FCC database). Listen to the demodulated audio and adjust PPM "
            "until it sounds natural. For broadcast FM, the easiest reference is a station that "
            "carries RDS: when the RDS PI code decodes successfully, your PPM is close enough. "
            "Once you find your dongle's PPM offset, it stays constant for all frequencies "
            "(it is a property of the crystal, not the tuned band)."
        ),
        h2("Squelch"),
        body(
            "The squelch threshold mutes the audio output when the signal level drops below a "
            "configurable level. This prevents the constant hiss of background noise during "
            "periods of no signal. The squelch slider in the RF &amp; Audio panel sets the "
            "threshold from 0 to 100 percent of full scale. The S-meter shows the squelch "
            "threshold as a red dashed marker, so you can see at a glance whether the current "
            "signal is above or below the threshold."
        ),
        body(
            "Set squelch just above the noise floor: open the squelch fully (0 percent) and "
            "observe the S-meter reading during silence. Then set squelch to just above that "
            "level. The transport bar's SQL indicator shows OPEN (signal present) or CLOSED "
            "(signal absent). For scanners, squelch is used to detect signals: the squelch scan "
            "mode stops on each frequency where the signal exceeds the threshold."
        ),
    ]

def chapter5():
    return [
        PageBreak(),
        h1("Chapter 5: Connecting Real Hardware"),
        body(
            "This chapter walks through the complete process of connecting your physical RTL-SDR "
            "V3 dongle to the web console. The setup involves three components: the rtl_tcp "
            "daemon (talks to the USB dongle), the bridge script (wraps rtl_tcp and exposes it "
            "over WebSocket), and the web app (connects to the bridge). Once all three are "
            "running, you can receive real RF signals from your antenna."
        ),
        h2("Step 1: Install rtl_tcp"),
        body(
            "The rtl_tcp daemon ships with the open-source RTL-SDR package. Installation "
            "instructions vary by operating system."
        ),
        h3("macOS (Homebrew)"),
        code("brew install librtlsdr"),
        body(
            "This installs the librtlsdr library and the rtl_tcp command-line tool. The dongle "
            "is immediately accessible to non-root users - no udev rules needed on macOS."
        ),
        h3("Linux (Debian/Ubuntu)"),
        code("sudo apt install rtl-sdr"),
        body(
            "After installation, you need to set up udev rules so non-root users can access the "
            "USB device. See the &quot;USB Permissions&quot; section below."
        ),
        h3("Linux (Arch)"),
        code("sudo pacman -S rtl-sdr"),
        h3("Windows"),
        body(
            "Download prebuilt binaries from osmocom.org or rtl-sdr.com. The zip file contains "
            "rtl_tcp.exe and the necessary DLLs. Extract to a folder of your choice and add it "
            "to your PATH for convenience. Windows does not require udev rules."
        ),
        h2("Step 2: USB Permissions (Linux only)"),
        body(
            "On Linux, the RTL-SDR dongle appears as a USB device with VID:PID 0bda:2838. By "
            "default, only root can access raw USB devices. You need to install a udev rule that "
            "grants read/write permission to your user."
        ),
        code(
            "# Write udev rules covering RTL-SDR V3 + V4 + common clones\n"
            "sudo tee /etc/udev/rules.d/20.rtlsdr.rules > /dev/null <<'EOF'\n"
            "SUBSYSTEMS==\"usb\", ATTRS{idVendor}==\"0bda\", ATTRS{idProduct}==\"2838\", MODE:=\"0666\", GROUP=\"plugdev\"\n"
            "SUBSYSTEMS==\"usb\", ATTRS{idVendor}==\"0bda\", ATTRS{idProduct}==\"2832\", MODE:=\"0666\", GROUP=\"plugdev\"\n"
            "SUBSYSTEMS==\"usb\", ATTRS{idVendor}==\"1d50\", ATTRS{idProduct}==\"6089\", MODE:=\"0666\", GROUP=\"plugdev\"\n"
            "EOF\n\n"
            "sudo udevadm control --reload-rules\n"
            "sudo udevadm trigger\n\n"
            "# Add yourself to the plugdev group, then LOG OUT and back in\n"
            "sudo usermod -aG plugdev $USER"
        ),
        body(
            "After running these commands, you MUST log out and log back in (or reboot) for the "
            "group change to take effect. Then unplug and replug the dongle. If you see "
            "&quot;usb_open error -3&quot; when running rtl_tcp, the rules have not taken effect - "
            "see the troubleshooting section at the end of this chapter."
        ),
        tip(
            "As a quick fallback that bypasses udev entirely, you can run rtl_tcp as root: "
            "sudo rtl_tcp -s 2400000. The bridge itself does not need root - only rtl_tcp does."
        ),
        h2("Step 3: Start rtl_tcp"),
        body(
            "Plug in your RTL-SDR V3 and open a terminal. Run rtl_tcp with a default sample rate "
            "of 2.4 Msps (you can change this later from the web app):"
        ),
        code("rtl_tcp -s 2400000"),
        body("You should see output similar to:"),
        code(
            "Found 1 device(s):\n"
            "  0:  Realtek, RTL2838UHIDIR, SN: 00000001\n\n"
            "Using device 0: Generic RTL2832U OEM\n"
            "Found Rafael Micro R820T tuner\n"
            "[R82XX] PLL not locked!\n"
            "Listening on TCP port 1234..."
        ),
        callout(
            "If you see &quot;usb_open error -3&quot; or &quot;Failed to open rtlsdr device #0&quot;, "
            "your user does not have permission to access the USB device. Revisit Step 2 above, or "
            "use the sudo fallback: sudo rtl_tcp -s 2400000."
        ),
        h2("Step 4: Download and Run the Bridge"),
        body(
            "The bridge script wraps rtl_tcp and exposes the IQ stream over WebSocket so the "
            "browser can connect. The bridge is a single Node.js file with one dependency (the "
            "ws WebSocket library)."
        ),
        h3("Download the bridge"),
        body(
            "Open the web app and look for the Hardware Source panel in the top-left corner. "
            "Click the &quot;Real RTL-SDR&quot; button. The panel expands to show a download "
            "link for the bridge script. Click &quot;Download bridge script&quot; to save "
            "bridge.mjs to your Downloads folder."
        ),
        body("Alternatively, download directly from the running app:"),
        code(
            "mkdir -p ~/sdr-bridge\n"
            "cd ~/sdr-bridge\n"
            "# If the app is running locally:\n"
            "curl -O http://localhost:3000/download/sdr-bridge/bridge.mjs\n"
            "curl -O http://localhost:3000/download/sdr-bridge/package.json\n"
            "curl -O http://localhost:3000/download/sdr-bridge/README.md"
        ),
        h3("Install dependencies and start"),
        code(
            "cd ~/sdr-bridge\n"
            "npm install      # installs the ws WebSocket library\n"
            "npm start        # starts the bridge on port 8080"
        ),
        body("When the bridge starts, you should see:"),
        code(
            "[bridge] WebSocket server listening on ws://0.0.0.0:8080\n"
            "[bridge] HTTP download server listening on http://0.0.0.0:8081/recordings\n"
            "[bridge] connecting to rtl_tcp at 127.0.0.1:1234...\n"
            "[bridge] connected to rtl_tcp\n"
            "[bridge] rtl_tcp handshake OK (tuner: RTL-SDR V3 (R820T2))"
        ),
        body(
            "If you see the handshake message, the bridge is successfully connected to your "
            "dongle. The bridge is now waiting for the web app to connect."
        ),
        h2("Step 5: Connect from the Web App"),
        body(
            "In the web app's Hardware Source panel, ensure &quot;Real RTL-SDR&quot; is selected "
            "and the bridge URL is <font name='%s'>ws://localhost:8080</font> (the default). The "
            "status indicator should flip from OFFLINE to CONNECTING to LIVE HW within about one "
            "second. The bridge log will show a new &quot;client connected&quot; message."
            % MONO_FONT
        ),
        body(
            "Click the AUDIO ON button in the transport bar. You should hear demodulated audio "
            "from the current frequency. If you are still tuned to 91.5 MHz in WFM mode (the "
            "default), you will hear whatever FM station is broadcasting at that frequency in your "
            "area - or static if no station is there. Click around the spectrum to find a strong "
            "peak, then enable AUDIO to hear it."
        ),
        h2("Portable Access with TLS (wss://)"),
        body(
            "By default the bridge speaks plain ws:// (insecure WebSocket). Browsers allow "
            "ws://localhost from any page, but if you want to access the dongle from another "
            "device - your phone, another PC, or the cloud preview - you need wss:// (TLS)."
        ),
        h3("Option A: Self-signed certificate (LAN access)"),
        body("Start the bridge with the --tls flag; it auto-generates a self-signed certificate:"),
        code(
            "node bridge.mjs --tls\n"
            "# Bridge now listens on wss://0.0.0.0:8443\n"
            "# Certificate saved to ./certs/cert.pem and ./certs/key.pem"
        ),
        body(
            "Your browser will warn about the self-signed certificate the first time. Visit "
            "https://your-pc-ip:8443/ once in your browser and click &quot;Advanced -&gt; "
            "Proceed&quot; to trust it. After that, the WebSocket URL "
            "wss://your-pc-ip:8443 works from any device on your LAN."
        ),
        h3("Option B: Your own certificate"),
        body("If you have a Let's Encrypt certificate or a corporate CA, pass the paths directly:"),
        code("node bridge.mjs --tls --cert /path/fullchain.pem --key /path/privkey.pem"),
        h3("Option C: ngrok tunnel (anywhere access)"),
        body(
            "If you want to access the dongle from anywhere in the world, use ngrok to tunnel "
            "the bridge:"
        ),
        code(
            "# Terminal 1 - your bridge\n"
            "node bridge.mjs\n\n"
            "# Terminal 2 - expose via ngrok\n"
            "ngrok http 8080\n"
            "# Outputs: https://abcd-1234.ngrok-free.app"
        ),
        body(
            "Then in the web app, set the bridge URL to wss://abcd-1234.ngrok-free.app "
            "(replacing with your actual ngrok URL). This works from any browser anywhere in the "
            "world and tunnels through your firewall automatically."
        ),
        h2("Troubleshooting Connection Issues"),
        h3("usb_open error -3"),
        body(
            "This is a Linux USB permission error. Your user cannot access the raw USB device. "
            "Apply the udev rules from Step 2 above, log out, and log back in. If that fails, "
            "use the sudo fallback: sudo rtl_tcp -s 2400000. The bridge itself does not need "
            "root - only rtl_tcp does."
        ),
        h3("Bridge shows &quot;rtl_tcp connection closed, reconnecting&quot;"),
        body(
            "The dongle may have been unplugged, or another SDR app is holding it. Close any "
            "other SDR software (SDR#, GQRX, CubicSDR), then restart rtl_tcp. The bridge will "
            "automatically reconnect within 2 seconds once rtl_tcp is back."
        ),
        h3("Web app shows OFFLINE even with bridge running"),
        body(
            "Check the bridge URL in the Hardware Source panel. If the bridge is on a different "
            "PC, you need to enter that PC's IP address (e.g. ws://192.168.1.50:8080). If you are "
            "accessing the web app via HTTPS, you must use wss:// and start the bridge with "
            "--tls. Browsers block ws:// from HTTPS pages except to localhost."
        ),
        h3("No audio even with signal present"),
        body(
            "Verify the audio activity meter in the transport bar shows non-zero values. If it "
            "shows 0 percent, the demodulator is producing silence - check that you are on the "
            "correct demod mode (WFM for broadcast FM, AM for airband, etc.) and that the signal "
            "is centered in the filter window (amber dashed lines on the spectrum). If the meter "
            "shows activity but you hear nothing, check your browser's audio output settings and "
            "system volume."
        ),
        h3("Audio sounds clipped or choppy"),
        body(
            "The browser's WebSocket throughput tops out around 2-3 MB/s on a clean LAN. At 2.4 "
            "Msps, that is 4.8 MB/s of IQ data - too much for some connections. Try a lower "
            "sample rate: 1.024 Msps or 0.24 Msps. The bridge will report overruns in the "
            "connection panel if it is dropping samples."
        ),
        h3("Tuner shows &quot;RTL-SDR (tuner 83886080)&quot; instead of &quot;R820T&quot;"),
        body(
            "This was a bug in an earlier version of the bridge that read the rtl_tcp handshake "
            "with the wrong byte order. The number 83886080 is 5 in big-endian (which is the "
            "R820T tuner ID). Update to the latest bridge version (re-download bridge.mjs from "
            "the Connection panel). The fix reads the handshake correctly and displays "
            "&quot;RTL-SDR V3 (R820T2)&quot; as expected."
        ),
    ]
