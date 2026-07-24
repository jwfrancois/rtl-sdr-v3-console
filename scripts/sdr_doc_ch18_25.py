"""
Chapters 18-25 + Appendices: Scanner, Notch, Recording, Antenna, Shortcuts, Troubleshooting, Glossary, Limitations, Appendices.
"""

from reportlab.lib.units import mm
from sdr_doc import (
    mm,
    h1, h2, h3, body, code, callout, tip, warning, hr, make_table,
    PageBreak, MONO_FONT,
)

def chapter18_scanner():
    return [
        PageBreak(),
        h1("Chapter 18: Scanner Mode"),
        body(
            "The scanner automates signal discovery. Instead of manually clicking through "
            "frequencies looking for activity, the scanner steps through a band (or watches "
            "the current spectrum) and either tunes to the strongest signal or collects all "
            "signals into a list. Three scan modes cover different use cases."
        ),
        h2("Scan Modes"),
        h3("Peak Scan"),
        body(
            "Continuously finds the strongest signal in the current spectrum view and tunes "
            "to it every 800 ms. This is the simplest mode - useful for finding whatever is "
            "loudest right now. It is great for FM broadcast (tune to the strongest local "
            "station) or for monitoring a band where you expect one strong signal at a time."
        ),
        body(
            "Click the &quot;FIND STRONGEST SIGNAL&quot; button to start peak scanning. The "
            "scanner retunes the SDR to the peak every 800 ms and updates the spectrum display "
            "to show the new center frequency. Click the button again (now labeled "
            "&quot;STOP PEAK SCAN&quot;) to stop."
        ),
        h3("Sweep Scan"),
        body(
            "Sweeps through a band in 70 percent sample-rate steps, collecting every signal "
            "above -60 dBFS into a sorted list. After the sweep completes, the list shows "
            "each found signal with frequency and strength, sorted strongest first. Click any "
            "entry to tune back to it."
        ),
        body(
            "To sweep a band, pick a band preset (FM Broadcast, Airband, 2m Ham, NOAA, Marine, "
            "70cm Ham, GMRS/FRS, Shortwave, or CB Radio) and click SWEEP. The scanner tunes "
            "across the band, pausing 120 ms at each step to capture the spectrum. A full FM "
            "broadcast sweep (87.5-108 MHz) takes about 30 seconds at 2.4 Msps."
        ),
        h3("Squelch Scan"),
        body(
            "Steps through a band in channel-sized increments, stopping for 3 seconds on each "
            "frequency where the signal exceeds the squelch threshold. This is the traditional "
            "&quot;scanner radio&quot; behavior - it pauses on active channels so you can hear "
            "what is being said, then continues."
        ),
        body(
            "Set the squelch threshold in the RF &amp; Audio panel (typically 15-25 percent). "
            "Pick a band preset and click SQL. The scanner tunes to each channel, waits 150 ms "
            "for the spectrum to settle, checks if the center bin exceeds the squelch threshold, "
            "and either pauses for 3 seconds (signal found) or moves to the next channel."
        ),
        h2("Band Presets"),
        body("The scanner has 9 pre-configured band presets:"),
        make_table(
            ["Band", "Range", "Step", "Demod", "Use"],
            [
                ["FM Broadcast", "87.5-108 MHz", "200 kHz", "WFM", "Local FM stations"],
                ["Airband (AM)", "118-137 MHz", "25 kHz", "AM", "ATC communications"],
                ["2m Ham Band", "144-148 MHz", "12.5 kHz", "NFM", "Ham radio voice"],
                ["NOAA Weather", "162.4-162.55 MHz", "25 kHz", "NFM", "Weather radio"],
                ["Marine VHF", "156-162 MHz", "25 kHz", "NFM", "Boat communications"],
                ["70cm Ham", "420-450 MHz", "25 kHz", "NFM", "Ham radio voice"],
                ["GMRS / FRS", "462-467 MHz", "12.5 kHz", "NFM", "Family radio"],
                ["Shortwave (HF)", "3-30 MHz", "5 kHz", "AM", "International broadcast"],
                ["CB Radio", "26.965-27.405 MHz", "10 kHz", "AM", "Citizens Band"],
            ],
            col_widths=[28*mm, 28*mm, 18*mm, 18*mm, 58*mm],
        ),
        body(
            "Each preset configures the appropriate demodulator mode, bandwidth, and step "
            "size automatically. The step size matches the channel spacing used in that band - "
            "for example, marine VHF uses 25 kHz channels, so the scanner steps by 25 kHz to "
            "land on each valid channel frequency."
        ),
        h2("Interpreting Results"),
        h3("Found Signals List"),
        body(
            "After a sweep or squelch scan, the found signals list shows each detected "
            "frequency with its signal strength in dBFS. The list is sorted strongest first. "
            "Click any entry to tune back to it. The list persists until you click Clear or "
            "start a new scan."
        ),
        h3("Live Position Indicator"),
        body(
            "During a scan, the panel shows the current scanning frequency in monospace "
            "text at the bottom. This updates in real time so you can watch the scanner's "
            "progress through the band."
        ),
        h2("Performance Notes"),
        body(
            "Sweep scan moves in 70 percent sample-rate steps to overlap coverage and avoid "
            "missing signals at the edges of each view. At 2.4 Msps, each step covers 1.68 "
            "MHz, and a full FM broadcast sweep (20.5 MHz wide) takes about 12 steps - roughly "
            "30 seconds including the 120 ms pause at each."
        ),
        body(
            "Squelch scan is slower because it pauses on active channels. In a busy band "
            "(like airband near an airport), a full 19 MHz scan might take 5-10 minutes "
            "because the scanner stops on every active frequency. Use peak scan for quick "
            "discovery, sweep scan for band mapping, and squelch scan for listening to "
            "conversations."
        ),
    ]

def chapter19_notch():
    return [
        PageBreak(),
        h1("Chapter 19: Notch Filter &amp; Interference"),
        body(
            "Strong local signals can swamp your RTL-SDR's front end, making it impossible "
            "to hear weaker signals on nearby frequencies. The most common example is a "
            "strong local FM broadcast station that desensitizes the receiver, preventing "
            "reception of weaker signals across the entire FM band. The notch filter lets "
            "you suppress these interferers by removing their IQ content before demodulation."
        ),
        h2("How Notch Filtering Works"),
        body(
            "A notch filter is a biquad IIR (infinite impulse response) filter that places "
            "zeros on the unit circle at the notch frequency (creating a deep null) and "
            "poles just inside the unit circle (to keep the notch narrow). The result is a "
            "narrow, deep suppression at a specific frequency, without affecting the rest of "
            "the spectrum."
        ),
        body(
            "The console applies notch filters to the complex IQ stream before demodulation. "
            "Each notch is applied independently to the I and Q channels. Up to 16 notches "
            "can be active simultaneously. The filter is computed in real time, adding about "
            "5 percent CPU load per notch on a modern machine."
        ),
        h2("Manual Notches"),
        body(
            "To add a manual notch, enter the frequency offset in Hz (relative to the tuned "
            "center frequency) in the input field and click the + button. For example, if "
            "you are tuned to 95.5 MHz and a strong local station is at 96.5 MHz, the "
            "offset is +1,000,000 Hz (1 MHz). The notch appears in the active list with "
            "an amber badge indicating it is manual."
        ),
        body(
            "Manual notches persist until you remove them (click the X next to the notch) "
            "or change the tuned frequency significantly. They are useful for persistent "
            "interferers like local FM stations, paging towers, or pager transmitters."
        ),
        h2("Auto-Detect Mode"),
        body(
            "Toggle the &quot;Auto-detect interferers&quot; switch to enable automatic notch "
            "detection. In auto-detect mode, the console scans the spectrum every 100 ms and "
            "looks for bins whose power is more than 25 dB above the local noise floor. Any "
            "such bin is automatically added as a notch, with a minimum spacing of 50 kHz "
            "to avoid duplicate notches on the same signal."
        ),
        body(
            "Auto-detected notches appear with a green AUTO badge. They are recomputed every "
            "100 ms, so they adapt to changing interference. Click &quot;CLEAR AUTO&quot; to "
            "remove all auto-detected notches at once (manual notches are preserved)."
        ),
        tip(
            "Auto-detect is best for quickly identifying interferers you did not know about. "
            "Once you have identified a persistent interferer (like a local FM station), "
            "convert it to a manual notch by removing the auto notch and adding it manually "
            "with the + button. Manual notches are stable across frequency changes."
        ),
        h2("When to Use Notches"),
        h3("Strong Local FM Station"),
        body(
            "If you live near an FM broadcast tower, the strong signal (often 0 dBFS or "
            "higher on the spectrum) can desensitize the RTL-SDR across the entire FM band. "
            "Add a manual notch at the offset of the offending station (e.g. if you are at "
            "95.5 MHz and the station is at 96.5 MHz, add a notch at +1,000,000 Hz). The "
            "notch suppresses the strong signal, allowing weaker stations to be heard."
        ),
        h3("Pager Tower Nearby"),
        body(
            "If you live near a pager tower (929-932 MHz), the constantly-transmitting pager "
            "signal can interfere with reception of weaker signals in the 900 MHz band. Add "
            "a manual notch at the pager tower's frequency offset."
        ),
        h3("ADS-B Reception"),
        body(
            "ADS-B at 1090 MHz is sometimes interfered with by nearby 1090 MHz sources (rare, "
            "but possible). If your ADS-B decode rate is unexpectedly low, check the spectrum "
            "for any strong signals within ±10 MHz of 1090 MHz and notch them."
        ),
        h2("What Notches Cannot Do"),
        body(
            "Notch filters suppress specific frequencies but cannot fix fundamentally weak "
            "signal reception. If your antenna is poorly positioned or the signal you want "
            "is below the noise floor, notches will not help - you need a better antenna. "
            "Also, notches cannot fix interference that is broadband (covering many frequencies) "
            "or that comes from inside your own equipment (e.g. USB 3.0 interference)."
        ),
        callout(
            "USB 3.0 ports generate broadband interference around 2.4 GHz that can interfere "
            "with SDR reception. If you see a high noise floor across the entire spectrum, try "
            "plugging the RTL-SDR into a USB 2.0 port instead, or use a USB extension cable "
            "to move the dongle away from the computer."
        ),
        h2("Q Factor"),
        body(
            "The Q factor controls how narrow the notch is. Higher Q = narrower notch (deeper "
            "suppression of a single frequency, less affect on adjacent frequencies). Lower Q "
            "= wider notch (suppresses a range of frequencies). The console uses a default Q "
            "of 30, which gives a notch about 1 kHz wide at 100 kHz offset. For most "
            "applications, the default Q is fine. Manual notches let you adjust Q if needed."
        ),
    ]

def chapter20_recording():
    return [
        PageBreak(),
        h1("Chapter 20: Recording &amp; Playback"),
        body(
            "The console supports two types of recording: IQ recording (raw RF data, written "
            "to disk on the bridge) and audio WAV recording (demodulated audio, captured in "
            "the browser). Both produce downloadable files in standard formats compatible "
            "with other SDR software."
        ),
        h2("IQ Recording"),
        h3("What it Records"),
        body(
            "IQ recording captures the raw IQ stream from the SDR, exactly as received from "
            "rtl_tcp. Each sample is two bytes (unsigned 8-bit I + unsigned 8-bit Q), giving "
            "a data rate of sample_rate * 2 bytes per second. At 2.4 Msps, that is 4.8 MB/s "
            "- so a 5-minute recording is about 1.4 GB."
        ),
        h3("How to Record"),
        body(
            "1. Connect to real hardware (see Chapter 5).<br/>"
            "2. Tune to the frequency you want to record.<br/>"
            "3. Click the RECORD button in the IQ Recording panel (right column). The "
            "button turns red and shows a pulsing indicator.<br/>"
            "4. Live stats appear: duration (seconds), file size (MB), and write rate (MB/s).<br/>"
            "5. Click STOP when done. The recording is saved on the bridge in the "
            "<font name='%s'>recordings/</font> directory." % MONO_FONT
        ),
        h3("File Format"),
        body(
            "Files are saved as raw unsigned 8-bit IQ (.raw), with no header. The filename "
            "includes the timestamp, frequency, and sample rate: e.g. "
            "<font name='%s'>iq-2026-01-15T12-34-56-91500000MHz-2400ksps.raw</font>. "
            "The format is compatible with SDR#, GQRX, GNU Radio, and most other SDR "
            "software." % MONO_FONT
        ),
        h3("Downloading"),
        body(
            "After stopping a recording, it appears in the saved recordings list in the panel. "
            "Click the download icon next to any recording to download it via HTTP (the "
            "bridge serves files on port 8081). Files are listed with size, timestamp, and "
            "download link."
        ),
        h3("Playback in Other Software"),
        body(
            "To replay a recording in SDR#: select File -&gt; Play, choose &quot;Raw IQ File&quot;, "
            "set the sample format to &quot;8-bit unsigned&quot;, and enter the original "
            "sample rate (from the filename). In GNU Radio, use a File Source block with item "
            "type &quot;complex&quot;, then multiply by 1/128 and subtract 1 to convert to "
            "float."
        ),
        h2("Audio WAV Recording"),
        h3("What it Records"),
        body(
            "Audio WAV recording captures the demodulated audio - exactly what you hear "
            "through your speakers. The audio is encoded as 16-bit PCM mono WAV at the "
            "demodulator's output rate (48 kHz for WFM/NFM/AM, 24 kHz for SSB/CW)."
        ),
        h3("How to Record"),
        body(
            "1. Connect to real hardware and enable audio (AUDIO ON).<br/>"
            "2. Click the RECORD AUDIO button in the Audio Recorder panel (right column, "
            "below the IQ Recording panel).<br/>"
            "3. Live duration counter shows elapsed recording time.<br/>"
            "4. Click STOP when done. The clip is encoded as a WAV file and added to the "
            "saved clips list."
        ),
        h3("Downloading"),
        body(
            "Saved clips appear in the clips list with duration, file size, download link, "
            "and delete button. Click the download icon to save the WAV file to your "
            "Downloads folder. Filenames include timestamp, frequency, and demod mode: e.g. "
            "<font name='%s'>audio-2026-01-15T12-34-56-91500000MHz-WFM.wav</font>." % MONO_FONT
        ),
        h2("Preset Sync"),
        body(
            "When connected to real hardware, the Memory Bank panel (right column) shows "
            "two cloud icons in the header: download (pull presets from bridge) and upload "
            "(push presets to bridge). This lets you sync your bookmarks across devices - "
            "save bookmarks on your desktop, push them to the bridge, then pull them on "
            "your laptop or phone."
        ),
        h3("Push to Bridge"),
        body(
            "Click the cloud-up icon to save your current bookmarks to the bridge. The "
            "bridge writes them to <font name='%s'>presets.json</font> in its working "
            "directory. The status message shows how many bookmarks were saved." % MONO_FONT
        ),
        h3("Pull from Bridge"),
        body(
            "Click the cloud-down icon to load bookmarks from the bridge. Your local "
            "bookmarks are replaced with the bridge's set. The status message shows how "
            "many bookmarks were loaded."
        ),
        tip(
            "Use preset sync to maintain a shared bookmark list across multiple devices. "
            "For example, set up bookmarks on your desktop at home, push them to the "
            "bridge, then pull them on your laptop when you take it to a different location."
        ),
    ]

def chapter21_antenna():
    return [
        PageBreak(),
        h1("Chapter 21: Antenna Guide"),
        body(
            "The antenna is the most important component of any SDR setup - more important "
            "than the dongle itself. A $30 dongle with a $50 antenna will outperform a $200 "
            "dongle with the stock whip. This chapter provides antenna recommendations for "
            "each band the console supports, plus connector and LNA guidance."
        ),
        h2("Antenna Basics"),
        body(
            "An antenna is a transducer that converts radio frequency electrical signals into "
            "electromagnetic waves (and vice versa). The key parameters are:"
        ),
        make_table(
            ["Parameter", "Description", "Why it Matters"],
            [
                ["Gain", "How much the antenna focuses energy in one direction", "Higher gain = more range but narrower pattern"],
                ["Polarization", "Orientation of the electromagnetic wave (vertical, horizontal, circular)", "Must match the transmitter for best reception"],
                ["Bandwidth", "Range of frequencies the antenna works over", "Wide bandwidth = one antenna for many bands"],
                ["Impedance", "AC resistance at the operating frequency (typically 50 ohms)", "Must match the coax and dongle"],
                ["Pattern", "Direction(s) of maximum sensitivity", "Omnidirectional vs directional"],
            ],
            col_widths=[28*mm, 60*mm, 72*mm],
        ),
        h2("Antenna Recommendations by Band"),
        h3("FM Broadcast (87.5-108 MHz)"),
        body(
            "The stock RTL-SDR whip works adequately for strong local FM stations. For "
            "better reception of weaker or more distant stations, a half-wave dipole "
            "(about 1.5 meters long) mounted vertically or horizontally will improve "
            "signal strength by 3-6 dB. A discone antenna provides broadband coverage but "
            "less gain than a dedicated dipole."
        ),
        h3("Airband (118-137 MHz)"),
        body(
            "Airband signals are vertically polarized. The stock whip works for nearby "
            "aircraft (within 20-30 miles). For better range, a vertical dipole or ground "
            "plane antenna cut for 130 MHz is recommended. A discone antenna provides "
            "good airband reception plus broadband coverage for other bands."
        ),
        h3("NOAA APT (137 MHz)"),
        body(
            "NOAA satellites transmit right-hand circular polarization (RHCP). A V-dipole "
            "is the simplest effective antenna - build two 53 cm wires in a V shape at 120 "
            "degrees apart, inclined about 30 degrees from horizontal. For better "
            "performance, a quadrifilar helix (QFH) antenna provides full circular "
            "polarization and works for entire satellite passes (including low-elevation "
            "passes where the satellite is near the horizon)."
        ),
        h3("ADS-B (1090 MHz)"),
        body(
            "ADS-B signals are vertically polarized. The stock whip works marginally. For "
            "good range (100-200 nm), a 1090 MHz antenna is recommended - either a "
            "1/4 wave ground plane, an 8-element collinear, or a commercial 1090 MHz "
            "antenna. A low-noise amplifier (LNA) at the antenna feed can extend range "
            "to 250+ nm."
        ),
        h3("POCSAG Pagers (929-932 MHz)"),
        body(
            "Pager signals are vertically polarized. The stock whip works for nearby pager "
            "towers. For better range, a 900 MHz Yagi pointed at the nearest pager tower "
            "is recommended. A 4-element Yagi provides 8-10 dB gain over the stock whip."
        ),
        h3("GPS L1 (1575.42 MHz)"),
        body(
            "GPS signals are right-hand circular polarized (RHCP) and extremely weak. An "
            "active GPS antenna (with built-in LNA) is essential - the stock whip will NOT "
            "work. Active GPS antennas cost $5-15 and have MCX or SMA connectors. They "
            "require DC power (3-5V) injected onto the coax - the RTL-SDR V3 can provide "
            "this via its software-controlled bias tee."
        ),
        h3("GOES HRIT (1685 MHz) / Inmarsat STD-C (1537-1545 MHz)"),
        body(
            "These L-band satellite signals are RHCP and very weak. A directional antenna "
            "(10-turn helical or 60cm dish with patch feed) plus an LNA is required. The "
            "antenna must be pointed at the satellite with about 5-degree accuracy. Use "
            "an online satellite look-angle calculator to find azimuth and elevation from "
            "your location."
        ),
        h2("Connector Types"),
        body(
            "The RTL-SDR V3 has an MCX (Micro-Coax) antenna connector. Most aftermarket "
            "antennas use SMA or BNC connectors. You will need an adapter:"
        ),
        make_table(
            ["From", "To", "Adapter Type", "Cost"],
            [
                ["MCX (RTL-SDR)", "SMA (most antennas)", "MCX male to SMA female", "$3-5"],
                ["MCX (RTL-SDR)", "BNC (older antennas)", "MCX male to BNC female", "$4-6"],
                ["MCX (RTL-SDR)", "F (TV coax)", "MCX male to F female", "$3-5"],
                ["SMA (active GPS)", "MCX (RTL-SDR)", "SMA male to MCX female", "$3-5"],
            ],
            col_widths=[35*mm, 40*mm, 50*mm, 25*mm],
        ),
        body(
            "Use high-quality adapters (not the cheapest) - cheap adapters can introduce "
            "intermodulation distortion and signal loss. Aim for brass or nickel-plated "
            "adapters from reputable brands."
        ),
        h2("LNA (Low-Noise Amplifier)"),
        body(
            "An LNA amplifies weak signals at the antenna feed, before they travel down "
            "the coax (where they would be attenuated further). This is critical for weak "
            "signals like GPS, GOES, and Inmarsat. LNAs are rated by noise figure (NF, "
            "lower is better) and gain (typically 20-30 dB)."
        ),
        body(
            "Place the LNA directly at the antenna feed - before any coax. A 5-meter run "
            "of cheap RG-58 coax at 1.5 GHz loses about 3 dB of signal - placing the LNA "
            "before the coax overcomes this loss. For GPS and satellite reception, an LNA "
            "with NF under 1 dB is recommended (the RTL-SDR's internal noise figure is "
            "about 3.5 dB, so the LNA makes a real difference)."
        ),
        h2("Coax Cable"),
        body(
            "Coax quality matters more at higher frequencies. For runs over 3 meters at "
            "frequencies above 1 GHz, use low-loss coax like LMR-240 or LMR-400 instead "
            "of the cheap RG-58 that comes with most antennas. The difference can be 3-6 "
            "dB of signal loss, which is the difference between a usable signal and static."
        ),
        tip(
            "If you cannot upgrade the coax, mount the RTL-SDR dongle at the antenna and "
            "use a long active USB extension cable instead. This eliminates coax loss "
            "entirely - the IQ data travels over USB (digital, lossless) instead of RF "
            "coax (analog, lossy)."
        ),
    ]

def chapter22_shortcuts():
    return [
        PageBreak(),
        h1("Chapter 22: Keyboard Shortcuts"),
        body(
            "The console supports keyboard shortcuts for common operations. Press the ? key "
            "(or click the keyboard icon in the bottom-right corner) to open the shortcuts "
            "help overlay at any time. Shortcuts are disabled while typing in input fields."
        ),
        h2("Complete Shortcut Reference"),
        make_table(
            ["Key", "Action", "Notes"],
            [
                ["Space / M", "Toggle audio mute", "Same as clicking AUDIO ON/OFF"],
                ["Up arrow", "Tune up 25 kHz", "Step size for quick scanning"],
                ["Down arrow", "Tune down 25 kHz", "Step size for quick scanning"],
                ["Left arrow", "Previous demod mode", "Cycles WFM - NFM - AM - USB - LSB - CW - RAW"],
                ["Right arrow", "Next demod mode", "Cycles the other direction"],
                ["[ or {", "Lower sample rate", "Steps through 8 sample rate presets"],
                ["] or }", "Higher sample rate", "Steps through 8 sample rate presets"],
                ["- or _", "Lower gain by 1 dB", "Only when AGC is off"],
                ["+ or =", "Higher gain by 1 dB", "Only when AGC is off"],
                ["A", "Toggle AGC", "Switches between manual and auto gain"],
                ["R", "Toggle IQ recording", "Same as clicking REC button"],
                ["S", "Toggle scan mode", "Starts/stops peak scan"],
                ["F", "Toggle fullscreen spectrum", "ESC to exit"],
                ["?", "Show keyboard shortcuts overlay", "Click or press ? key"],
                ["Escape", "Close dialog / exit fullscreen", "Closes any modal or fullscreen mode"],
            ],
            col_widths=[24*mm, 50*mm, 86*mm],
        ),
        h2("Workflow Tips"),
        h3("Quick Scanning"),
        body(
            "To quickly scan a band: press S to start peak scanning (the scanner auto-tunes "
            "to the strongest signal every 800 ms), then press Space to listen. If you hear "
            "something interesting, press S again to stop scanning, then press R to record."
        ),
        h3("Demodulator Switching"),
        body(
            "When exploring an unknown band, use the left and right arrow keys to cycle "
            "through demodulator modes. Listen to each one - if the audio sounds right "
            "(voice, music, morse, etc.), you have found the correct demod for that signal."
        ),
        h3("Sample Rate Adjustment"),
        body(
            "Use the [ and ] keys to adjust sample rate. Lower sample rates (240 ksps, "
            "1.024 Msps) are useful for narrow signals and reduce CPU load. Higher sample "
            "rates (2.4 Msps, 3.2 Msps) are needed for wide signals (FM broadcast, ADS-B) "
            "and provide more spectrum visibility."
        ),
        h3("Gain Tuning"),
        body(
            "With AGC off, use - and + to fine-tune gain in 1 dB steps. Watch the spectrum "
            "while adjusting - you want the noise floor around -80 to -70 dBFS and signals "
            "peaking around -30 to -10 dBFS. If you see clipping (signals hitting 0 dBFS), "
            "reduce gain."
        ),
        h2("Accessibility"),
        body(
            "All shortcuts work with both lowercase and uppercase letters (no Shift "
            "required). The keyboard help overlay is keyboard-navigable: Tab to move "
            "between sections, Enter to close. Screen readers will announce the shortcut "
            "names and descriptions."
        ),
    ]

def chapter23_troubleshooting():
    return [
        PageBreak(),
        h1("Chapter 23: Troubleshooting"),
        body(
            "This chapter provides solutions for the most common issues you may encounter "
            "while using the RTL-SDR V3 Console. Issues are grouped by category: "
            "installation, bridge connection, audio, signals, and decoders."
        ),
        h2("Installation Issues"),
        h3("npm install fails with &quot;ENOENT: no such file or directory&quot;"),
        body(
            "You are running npm install in a directory without a package.json file. Make "
            "sure you have cloned the repository and cd'd into it before running npm install. "
            "If you are trying to install the bridge, download both bridge.mjs AND "
            "package.json from the Connection panel into the same folder."
        ),
        h3("npm run dev fails with &quot;Cannot find module&quot;"),
        body(
            "Dependencies are not installed. Run npm install first, then npm run dev. If "
            "the error persists, delete node_modules and package-lock.json, then run npm "
            "install again."
        ),
        h3("Page loads but shows a white screen"),
        body(
            "Check the browser console (F12 -&gt; Console) for JavaScript errors. Common "
            "causes: browser cache serving old code (try Ctrl+Shift+R for hard refresh), "
            "JavaScript disabled, or a syntax error in custom modifications. The dev server "
            "log at /home/z/my-project/dev.log may also show errors."
        ),
        h2("Bridge Connection Issues"),
        h3("usb_open error -3 (Linux)"),
        body(
            "Your user does not have permission to access the USB device. Apply the udev "
            "rules from Chapter 5 Step 2, then log out and log back in. If that fails, "
            "use the sudo fallback: sudo rtl_tcp -s 2400000. The bridge itself does not "
            "need root - only rtl_tcp does."
        ),
        h3("Bridge shows &quot;rtl_tcp connection closed, reconnecting&quot;"),
        body(
            "The dongle was unplugged or another SDR app is holding it. Close any other SDR "
            "software (SDR#, GQRX, CubicSDR, etc.), then restart rtl_tcp. The bridge will "
            "automatically reconnect within 2 seconds."
        ),
        h3("Bridge shows &quot;tuner: RTL-SDR (tuner 83886080)&quot; instead of &quot;R820T&quot;"),
        body(
            "This was a bug in an earlier version of the bridge that read the rtl_tcp "
            "handshake with the wrong byte order. The number 83886080 is actually 5 in "
            "big-endian, which is the R820T tuner ID. Update to the latest bridge version "
            "(re-download bridge.mjs from the Connection panel)."
        ),
        h3("Web app shows OFFLINE even with bridge running"),
        body(
            "Check the bridge URL in the Hardware Source panel. If the bridge is on a "
            "different PC, enter that PC's IP address (e.g. ws://192.168.1.50:8080). If "
            "you are accessing the web app via HTTPS (the cloud preview), you must use "
            "wss:// and start the bridge with --tls. Browsers block ws:// from HTTPS pages "
            "except to localhost."
        ),
        h3("SyntaxError: Invalid regular expression flags"),
        body(
            "The bridge.mjs file is corrupted - the leading # character of the shebang line "
            "(#!/usr/bin/env node) was stripped during copy-paste. Fix it with: "
            "sed -i '1s/^!/#/' ~/sdr-bridge/bridge.mjs. Then verify with: "
            "head -1 ~/sdr-bridge/bridge.mjs (should show #!/usr/bin/env node)."
        ),
        h2("Audio Issues"),
        h3("No audio even with signal present"),
        body(
            "Check the audio activity meter in the transport bar. If it shows 0%, the "
            "demodulator is producing silence - verify you are on the correct demod mode "
            "(WFM for broadcast FM, AM for airband, etc.) and the signal is centered in "
            "the filter window (amber dashed lines on spectrum). If the meter shows "
            "activity but you hear nothing, check your browser's audio output and system "
            "volume."
        ),
        h3("Audio sounds clipped or choppy"),
        body(
            "The browser's WebSocket throughput tops out around 2-3 MB/s on a clean LAN. "
            "At 2.4 Msps, that is 4.8 MB/s of IQ data - too much for some connections. "
            "Try a lower sample rate: 1.024 Msps or 0.24 Msps. The bridge will report "
            "overruns in the connection panel if it is dropping samples."
        ),
        h3("Audio sounds distorted or off-pitch"),
        body(
            "Your dongle's PPM correction is off. Tune to a known exact frequency (e.g. a "
            "local FM station's licensed frequency from the FCC database) and adjust the "
            "PPM slider in the RF &amp; Audio panel until the audio sounds natural. Once "
            "calibrated, the PPM value is constant for all frequencies."
        ),
        h3("Audio works in simulated mode but not real mode"),
        body(
            "The simulated audio engine and real audio engine use different code paths. In "
            "real mode, the audio engine needs to receive demodulated PCM frames from the "
            "real SDR source. If the activity meter shows 0%, the real audio path is not "
            "being fed. Verify you have clicked AUDIO ON after switching to real mode (the "
            "AudioContext needs a user gesture to start)."
        ),
        h2("Signal Issues"),
        h3("Spectrum shows only noise, no signals"),
        body(
            "Check your antenna connection. The stock RTL-SDR whip should pick up at least "
            "some FM broadcast stations. If you see only noise: (1) verify the antenna is "
            "firmly connected to the MCX jack, (2) try a different antenna, (3) check "
            "that you are not in a shielded location (basement, metal building). Try "
            "tuning to a known strong FM station (e.g. 91.5 MHz, 101.5 MHz) - you should "
            "see a clear peak."
        ),
        h3("Strong signal but no decode"),
        body(
            "Each decoder requires specific conditions: RDS needs WFM mode and a station "
            "that broadcasts RDS; ADS-B needs 1090 MHz and an aircraft overhead; APT needs "
            "a satellite pass overhead. Check the decoder's chapter for specific requirements. "
            "Also verify the PPM correction - some decoders (RDS, HD Radio) are sensitive "
            "to frequency error."
        ),
        h3("Hydration error in browser console"),
        body(
            "If you see &quot;Hydration failed because the server rendered text didn't match "
            "the client&quot;, this is usually caused by a browser extension (Grammarly, "
            "LastPass) injecting attributes into the HTML before React loads. The fix is to "
            "add suppressHydrationWarning to the body tag. This has been done in the latest "
            "version of the app - if you still see it, you may have a cached old version "
            "(try Ctrl+Shift+R)."
        ),
        h3("High CPU usage"),
        body(
            "The real-SDR pipeline runs an FFT + demodulator + decoders on every IQ block. "
            "At 2.4 Msps, this consumes about 30-50% of one CPU core on a modern machine. "
            "If CPU usage is excessive: (1) reduce sample rate to 1.024 Msps, (2) close "
            "decoder panels you are not using (decoders auto-pause when their panel is not "
            "subscribed), (3) reduce the spectrum size if you have customized it."
        ),
        h2("Decoder-Specific Issues"),
        h3("RDS overlay shows &quot;Waiting for RDS data&quot; indefinitely"),
        body(
            "The signal is too weak or the station does not broadcast RDS. Try a stronger "
            "station (look for a tall peak on the spectrum). Some community and college "
            "stations do not carry RDS. Also check PPM correction - RDS is sensitive to "
            "frequency error."
        ),
        h3("ADS-B shows no aircraft"),
        body(
            "Verify you are tuned to 1090 MHz with sample rate 2.4 Msps. The antenna must "
            "be vertical and have a clear view of the sky. Try a different antenna position "
            "or upgrade to a 1090 MHz antenna. Check flightradar24.com to verify aircraft "
            "are in your area - if no planes are nearby, you will not decode any."
        ),
        h3("APT image is slanted or curved"),
        body(
            "Your PPM correction is off. Adjust the PPM slider in the RF &amp; Audio panel "
            "until the image straightens out. Start at 0 PPM and adjust in steps of 5-10 "
            "PPM until the sync locks consistently. Once calibrated, the value is constant "
            "for all frequencies."
        ),
        h3("GPS shows no satellites"),
        body(
            "You need an active GPS antenna (with built-in LNA) - the stock whip will NOT "
            "work for GPS. Also ensure the antenna has a clear view of the sky - indoors "
            "you may get 0-2 satellites. Try moving the antenna to a window or outdoors."
        ),
    ]

def chapter24_glossary():
    return [
        PageBreak(),
        h1("Chapter 24: Glossary"),
        body(
            "This glossary defines the radio and SDR terms used throughout this documentation. "
            "Terms are listed alphabetically. If you encounter a term not defined here, "
            "Wikipedia and the ARRL Handbook are excellent additional references."
        ),
        make_table(
            ["Term", "Definition"],
            [
                ["ACARS", "Aircraft Communications Addressing and Reporting System. Digital text messaging between aircraft and dispatchers on 131.55 MHz."],
                ["ADS-B", "Automatic Dependent Surveillance-Broadcast. Aircraft transponder system broadcasting position/altitude on 1090 MHz."],
                ["AGC", "Automatic Gain Control. Circuit that automatically adjusts receiver gain to maintain constant output level."],
                ["ALFN", "Absolute Frame Number. HD Radio's GPS-locked time reference, counting milliseconds since GPS epoch (Jan 6, 1980)."],
                ["AM", "Amplitude Modulation. Encoding information in the amplitude of a carrier wave."],
                ["APT", "Automatic Picture Transmission. NOAA weather satellite image format on 137 MHz."],
                ["BCH", "Bose-Chaudhuri-Hocquenghem. A class of error-correcting codes used in POCSAG."],
                ["BER", "Bit Error Rate. Fraction of received bits that are incorrect."],
                ["BPSK", "Binary Phase Shift Keying. Digital modulation using two phase states (0 and 180 degrees)."],
                ["Biquad", "Second-order IIR filter used for low-pass, high-pass, band-pass, and notch filtering."],
                ["C/A code", "Coarse/Acquisition code. The civil GPS spread-spectrum code at 1.023 Mchips/s."],
                ["CADU", "Channel Access Data Unit. CCSDS frame structure used in satellite communications."],
                ["CDMA", "Code Division Multiple Access. Multiple transmitters share the same frequency using unique spread-spectrum codes."],
                ["C/N0", "Carrier-to-noise density ratio. GPS signal strength metric in dB-Hz."],
                ["CPR", "Compact Position Reporting. ADS-B's encoding scheme for lat/lon in 35 bits each."],
                ["CRC", "Cyclic Redundancy Check. Error-detecting code appended to data frames."],
                ["CT", "Clock Time. RDS field carrying UTC time and date."],
                ["CW", "Continuous Wave. Morse code transmission (an unmodulated carrier keyed on and off)."],
                ["dBFS", "Decibels relative to Full Scale. Signal level relative to the maximum the SDR can represent."],
                ["DBPSK", "Differential BPSK. BPSK where the phase difference between consecutive symbols carries the data."],
                ["Doppler shift", "Frequency change due to relative motion between transmitter and receiver."],
                ["EVM", "Error Vector Magnitude. Measure of modulation quality (lower is better)."],
                ["FEC", "Forward Error Correction. Redundant data added to allow error correction at the receiver."],
                ["FM", "Frequency Modulation. Encoding information in the frequency of a carrier wave."],
                ["FSK", "Frequency Shift Keying. Digital modulation using discrete frequency changes."],
                ["GMDSS", "Global Maritime Distress and Safety System. International maritime emergency communication system."],
                ["GOES", "Geostationary Operational Environmental Satellite. US weather satellite system."],
                ["GPS", "Global Positioning System. US satellite navigation system on 1575.42 MHz."],
                ["HD Radio", "Hybrid Digital Radio. North American digital broadcasting standard (NRSC-5)."],
                ["HDLC", "High-Level Data Link Control. Frame protocol used in Inmarsat STD-C and many other protocols."],
                ["HDC", "High-Definition Coding. Proprietary audio codec used in HD Radio (no open-source decoder)."],
                ["ICAO", "International Civil Aviation Organization. 24-bit unique aircraft address in ADS-B."],
                ["IIR", "Infinite Impulse Response. A class of digital filters with feedback (e.g. biquad)."],
                ["IQ samples", "Complex baseband samples (In-phase + Quadrature) representing the received signal."],
                ["LFSR", "Linear Feedback Shift Register. Used to generate GPS C/A codes."],
                ["LNA", "Low-Noise Amplifier. Preamplifier placed at the antenna feed to overcome coax loss."],
                ["LSB", "Lower Sideband. SSB mode keeping the lower sideband (frequencies below the carrier)."],
                ["MSK", "Minimum Shift Keying. FSK with deviation exactly half the bit rate (used in ACARS)."],
                ["NCS", "Network Coordination Station. Inmarsat's master station for each satellite region."],
                ["NFM", "Narrow FM. FM with 5 kHz deviation, used for VHF/UHF voice."],
                ["NRSC-5", "Standard governing HD Radio in North America."],
                ["OFDM", "Orthogonal Frequency Division Multiplexing. Multi-carrier modulation used in HD Radio and WiFi."],
                ["OOOI", "Out/Off/On/In. ACARS flight phase reports."],
                ["PCM", "Pulse Code Modulation. Digital audio encoding (used in WAV files)."],
                ["PI code", "Program Identification. 4-hex RDS code uniquely identifying a station."],
                ["POCSAG", "Post Office Code Standardization Advisory Group. Pager protocol on 929-932 MHz."],
                ["PPM", "Parts Per Million. Frequency error unit (1 PPM at 100 MHz = 100 Hz error)."],
                ["PRN", "Pseudo-Random Noise. GPS satellite identifier (PRN-1 through PRN-32)."],
                ["PS", "Program Service. RDS field carrying the 8-character station name."],
                ["PSK", "Phase Shift Keying. Digital modulation using discrete phase changes."],
                ["PTY", "Program Type. RDS field (0-31) indicating station format (News, Rock, etc.)."],
                ["Q factor", "Quality factor of a filter. Higher Q = narrower bandwidth."],
                ["QAM", "Quadrature Amplitude Modulation. Combined amplitude + phase modulation."],
                ["QFH", "Quadrifilar Helix. Antenna with circular polarization for satellite reception."],
                ["QPSK", "Quadrature PSK. PSK with 4 phase states (2 bits per symbol)."],
                ["RDS", "Radio Data System. 1187.5 bps data subcarrier on FM broadcast (57 kHz)."],
                ["RHCP", "Right-Hand Circular Polarization. Antenna polarization used by GPS and weather satellites."],
                ["RT", "Radio Text. RDS field carrying up to 64 characters of free text."],
                ["S-meter", "Signal strength meter (S0 through S9+60 dB)."],
                ["SNR", "Signal-to-Noise Ratio. Ratio of signal power to noise power."],
                ["SSB", "Single Sideband. AM with one sideband removed for efficiency (USB or LSB)."],
                ["STD-C", "Standard-C. Inmarsat's low-bit-rate messaging service on L-band."],
                ["Squelch", "Circuit that mutes audio when signal drops below a threshold."],
                ["TA", "Traffic Announcement. RDS flag indicating traffic news."],
                ["USB", "Upper Sideband. SSB mode keeping the upper sideband (frequencies above the carrier)."],
                ["Viterbi", "Convolutional code decoding algorithm used in many digital communications."],
                ["WAV", "Waveform Audio File Format. Standard uncompressed audio file format."],
                ["WFM", "Wide FM. FM with 75 kHz deviation, used for broadcast."],
            ],
            col_widths=[28*mm, 132*mm],
        ),
    ]

def chapter25_limitations():
    return [
        PageBreak(),
        h1("Chapter 25: Limitations &amp; What's Not Possible"),
        body(
            "This chapter provides an honest assessment of what the RTL-SDR V3 Console can "
            "and cannot do. Some limitations are inherent to the RTL-SDR hardware; others are "
            "implementation choices in the console. Understanding these limits helps you "
            "decide when to use this tool and when to upgrade to more capable hardware."
        ),
        h2("Hardware Limitations"),
        h3("Frequency Range"),
        body(
            "The RTL-SDR V3 covers 24 kHz to 1.75 GHz. This is a wide range but excludes "
            "several interesting bands:"
        ),
        make_table(
            ["Band", "Frequency", "What You're Missing"],
            [
                ["S-band", "2.3-2.4 GHz", "SiriusXM satellite radio"],
                ["C-band", "4-8 GHz", "Some satellite downlinks"],
                ["X-band", "8-12 GHz", "Military and satellite"],
                ["Ku-band", "12-18 GHz", "DirecTV, Dish Network"],
                ["Ka-band", "26-40 GHz", "Starlink user terminals"],
            ],
            col_widths=[24*mm, 32*mm, 104*mm],
        ),
        body(
            "To receive these higher bands, you need an SDR with a higher frequency range. "
            "The HackRF One covers up to 6 GHz (covers SiriusXM), the LimeSDR covers up to "
            "3.8 GHz, and the PlutoSDR covers up to 6 GHz. None of these can reach Starlink's "
            "user terminal frequency (12 GHz) - that requires specialized microwave SDRs."
        ),
        h3("Sample Rate"),
        body(
            "The RTL-SDR V3's maximum reliable sample rate is 3.2 Msps (theoretical max 3.2 "
            "Msps). This limits the maximum signal bandwidth you can receive to about 3.2 "
            "MHz. Wide signals like DVB-T (6-8 MHz), WiFi (20+ MHz), and LTE (up to 20 MHz) "
            "cannot be captured in full. Higher sample rates are possible with the RTL-SDR "
            "but become increasingly lossy due to USB 2.0 bandwidth limits."
        ),
        h3("Bit Depth"),
        body(
            "The RTL-SDR V3 produces 8-bit IQ samples. This gives about 48 dB of dynamic "
            "range, which is sufficient for most signals but limits the ability to receive "
            "weak signals in the presence of strong ones. For comparison, the Airspy R2 has "
            "12-bit ADCs (72 dB dynamic range), and the SDRplay RSPdx has 14-bit ADCs "
            "(84 dB dynamic range). The difference matters when you are trying to hear a "
            "weak signal adjacent to a strong one."
        ),
        h2("Software Limitations"),
        h3("HD Radio Audio"),
        body(
            "The console decodes HD Radio SIS (station information) but not HD Radio audio. "
            "HD Radio audio uses the HDC (High-Definition Coding) codec, which is "
            "proprietary and has no open-source decoder. Even the open-source nrsc5 project "
            "(the leading HD Radio decoder) had to reverse-engineer parts of the codec. "
            "Implementing HDC in JavaScript would require porting thousands of lines of C "
            "code and may face legal challenges."
        ),
        h3("GPS Position Fix"),
        body(
            "The console tracks GPS satellites and decodes nav bits, but does NOT compute a "
            "position fix. A full position fix requires parsing ephemeris data (satellite "
            "positions) from subframes 2 and 3 of the nav message, then performing "
            "trilateration using the pseudoranges from at least 4 satellites. This is "
            "mathematically straightforward but requires careful implementation of the "
            "trilateration algorithm. It is left as a future enhancement."
        ),
        h3("Meteor M2 Image Decompression"),
        body(
            "The console decodes Meteor M2 LRPT signal and assembles CCSDS CADU frames, but "
            "does NOT decompress the image data. Decompression requires JPEG-LS, a "
            "specialized lossless compression standard. Implementing JPEG-LS in JavaScript "
            "is possible but would require porting a C library. Instead, the console lets "
            "you download the raw CADU bytes for offline decompression with SatDump or "
            "similar tools."
        ),
        h3("DAB/DAB+ (European Digital Radio)"),
        body(
            "The console does not decode DAB/DAB+, the European digital radio standard. "
            "DAB uses OFDM on 174-240 MHz with a completely different protocol than HD Radio. "
            "Adding DAB support would require implementing a new OFDM demodulator, MP2/AAC "
            "audio decoder, and DAB-specific protocol stack. This is feasible but "
            "significant work."
        ),
        h3("Trunked Radio"),
        body(
            "The console does not track trunked radio systems (Motorola, P25 Phase II, "
            "EDACS, etc.). Trunking requires following talkgroup assignments across multiple "
            "frequencies, which is a complex state machine. For trunked radio monitoring, "
            "use dedicated software like SDRTrunk, Unitrunker, or DSD+."
        ),
        h2("What's Impossible (Not Just Hard)"),
        h3("SiriusXM Satellite Radio"),
        body(
            "SiriusXM broadcasts on 2.3 GHz (S-band), well above the RTL-SDR V3's 1.75 GHz "
            "cutoff. Even with a HackRF (6 GHz), SiriusXM uses the PAC (Perceptual Audio "
            "Coder) codec which is fully proprietary - there is no open-source decoder "
            "anywhere. SiriusXM also uses conditional access (encryption keyed to your "
            "receiver's ESN). Receiving SiriusXM with any SDR is impossible without the "
            "decryption keys, which only SiriusXM-controlled hardware has."
        ),
        h3("Starlink"),
        body(
            "Starlink user terminals receive on 10.7-12.7 GHz (Ku-band), far above the "
            "RTL-SDR's range. Even specialized microwave SDRs that can receive Ku-band "
            "would face Starlink's proprietary protocols, beam-hopping, and encryption. "
            "There is no way to decode Starlink traffic with any open-source tool."
        ),
        h3("Encrypted Communications"),
        body(
            "Many digital communications are encrypted: P25 with encryption (AES-256), "
            "TETRA with encryption, DMR with privacy keys, GSM/UMTS/LTE cellular, encrypted "
            "WiFi. The console does not and will not decrypt any encrypted communication. "
            "In most countries, decrypting communications you are not authorized to receive "
            "is illegal."
        ),
        h2("When to Upgrade"),
        body(
            "If you find yourself hitting the RTL-SDR V3's limits, consider upgrading to:"
        ),
        make_table(
            ["SDR", "Frequency Range", "Sample Rate", "Bits", "Best For", "Cost"],
            [
                ["RTL-SDR V3", "24 kHz - 1.75 GHz", "3.2 Msps", "8", "Beginner, general listening", "$30"],
                ["Airspy R2", "24 MHz - 1.8 GHz", "10 Msps", "12", "Weak signal, HF", "$170"],
                ["SDRplay RSPdx", "1 kHz - 2 GHz", "10 Msps", "14", "VLF/LF, multi-antenna", "$200"],
                ["HackRF One", "1 MHz - 6 GHz", "20 Msps", "8", "Wide band, transmit", "$300"],
                ["PlutoSDR", "70 MHz - 6 GHz", "56 Msps", "12", "5G, WiFi, transmit", "$200"],
                ["LimeSDR", "100 kHz - 3.8 GHz", "61 Msps", "12", "MIMO, transmit", "$300"],
            ],
            col_widths=[28*mm, 32*mm, 22*mm, 12*mm, 40*mm, 18*mm],
        ),
        body(
            "The RTL-SDR V3 is the best value for getting started with SDR. For most users, "
            "it covers the interesting bands (FM, airband, ADS-B, weather satellites, pagers, "
            "GPS) at a fraction of the cost of higher-end SDRs. Upgrade when you have a "
            "specific need that the RTL-SDR cannot meet."
        ),
    ]

def appendixA():
    return [
        PageBreak(),
        h1("Appendix A: Bridge Protocol Reference"),
        body(
            "This appendix provides a complete reference for the bridge's wire protocol, "
            "useful if you want to write your own client or extend the bridge."
        ),
        h2("Command-Line Flags"),
        make_table(
            ["Flag", "Default", "Description"],
            [
                ["--rtl-host", "127.0.0.1", "rtl_tcp host"],
                ["--rtl-port", "1234", "rtl_tcp port"],
                ["--ws-host", "0.0.0.0", "WebSocket bind address"],
                ["--ws-port", "8080", "WebSocket port"],
                ["--tls", "(off)", "Enable wss:// (auto-generates self-signed cert)"],
                ["--cert", "(auto)", "TLS certificate path (with --tls)"],
                ["--key", "(auto)", "TLS private key path (with --tls)"],
                ["--http-port", "8081", "HTTP server port (recordings + presets)"],
            ],
            col_widths=[28*mm, 22*mm, 120*mm],
        ),
        h2("WebSocket Commands (Client to Server)"),
        body("All commands are JSON text frames:"),
        code(
            '{"type":"set_frequency","hz":91500000}\n'
            '  Tune to a frequency in Hz.\n\n'
            '{"type":"set_sample_rate","hz":2400000}\n'
            '  Set the sample rate in Hz.\n\n'
            '{"type":"set_gain","db":30}\n'
            '  Set manual gain to 30 dB.\n\n'
            '{"type":"set_gain","db":"auto"}\n'
            '  Enable automatic gain control.\n\n'
            '{"type":"set_ppm","ppm":15}\n'
            '  Set frequency correction to +15 PPM.\n\n'
            '{"type":"start"}\n'
            '  Start streaming IQ data.\n\n'
            '{"type":"stop"}\n'
            '  Stop streaming IQ data.\n\n'
            '{"type":"status"}\n'
            '  Request an immediate status update.\n\n'
            '{"type":"start_recording"}\n'
            '  Start recording IQ to disk on the bridge.\n\n'
            '{"type":"stop_recording"}\n'
            '  Stop recording and finalize the file.'
        ),
        h2("WebSocket Messages (Server to Client)"),
        h3("Status Message"),
        body("Sent every 500 ms and on demand:"),
        code(
            '{\n'
            '  "type": "status",\n'
            '  "payload": {\n'
            '    "connected": true,\n'
            '    "deviceName": "RTL-SDR V3 (R820T2)",\n'
            '    "frequency": 91500000,\n'
            '    "sampleRate": 2400000,\n'
            '    "gainDb": 30,\n'
            '    "ppm": 0,\n'
            '    "gains": [],\n'
            '    "overruns": 0,\n'
            '    "uptime": 42.3,\n'
            '    "recording": null\n'
            '  }\n'
            '}'
        ),
        h3("Recording Complete Message"),
        body("Sent when recording stops:"),
        code(
            '{\n'
            '  "type": "recording_complete",\n'
            '  "payload": {\n'
            '    "path": "/path/to/recording.raw",\n'
            '    "bytes": 52428800,\n'
            '    "duration": 10.9,\n'
            '    "sampleRate": 2400000,\n'
            '    "frequency": 91500000\n'
            '  }\n'
            '}'
        ),
        h2("Binary IQ Frame Format"),
        body("Each binary frame has a 16-byte little-endian header followed by raw IQ bytes:"),
        make_table(
            ["Offset", "Size", "Type", "Description"],
            [
                ["0", "4", "uint32 LE", "Sample rate in Hz"],
                ["4", "4", "uint32 LE", "Frequency - low 32 bits"],
                ["8", "4", "uint32 LE", "Frequency - high 32 bits (always 0 for RTL-SDR)"],
                ["12", "4", "uint32 LE", "Timestamp (ms, truncated to 32 bits)"],
                ["16+", "variable", "bytes", "Interleaved unsigned 8-bit I/Q pairs"],
            ],
            col_widths=[18*mm, 14*mm, 24*mm, 114*mm],
        ),
        body(
            "Each IQ sample is two bytes: I (in-phase) and Q (quadrature), both unsigned 8-bit "
            "centered on 127. To convert to signed float: subtract 128, divide by 128. "
            "Frames are sent in 32 KB chunks (16K complex samples) every 50 ms."
        ),
        h2("HTTP Endpoints"),
        make_table(
            ["Endpoint", "Method", "Description"],
            [
                ["/health", "GET", "Returns JSON {ok:true, ws:'ws'|'wss', port:8080}"],
                ["/recordings", "GET", "Returns JSON array of saved recordings"],
                ["/recordings/{filename}", "GET", "Downloads a recording file"],
                ["/presets", "GET", "Returns saved bookmarks JSON (or empty)"],
                ["/presets", "PUT", "Saves bookmarks JSON to presets.json"],
            ],
            col_widths=[44*mm, 22*mm, 104*mm],
        ),
        h2("RTL-SDR Command Bytes"),
        body("The bridge forwards commands to rtl_tcp using its native binary protocol:"),
        make_table(
            ["Byte", "Constant", "Value Format", "Description"],
            [
                ["0x01", "SET_FREQUENCY", "uint32 BE (Hz)", "Tune to frequency"],
                ["0x02", "SET_SAMPLE_RATE", "uint32 BE (Hz)", "Set sample rate"],
                ["0x03", "SET_GAIN_MODE", "uint32 BE (0/1)", "0=manual, 1=auto"],
                ["0x04", "SET_GAIN", "uint32 BE (dB*10)", "Manual gain (300 = 30.0 dB)"],
                ["0x05", "SET_FREQ_CORRECTION", "uint32 BE (PPM)", "Frequency correction"],
            ],
            col_widths=[14*mm, 38*mm, 38*mm, 90*mm],
        ),
        body(
            "Each command is 5 bytes: 1 byte command code + 4 bytes big-endian value. The "
            "bridge handles the conversion from JSON commands to rtl_tcp binary commands "
            "automatically."
        ),
    ]

def appendixB():
    return [
        PageBreak(),
        h1("Appendix B: Frequency Reference"),
        body(
            "This appendix provides a quick reference for all frequencies the console can "
            "receive, organized by band. Use it to plan your antenna setup and know what "
            "to expect at each frequency."
        ),
        h2("Broadcast Bands"),
        make_table(
            ["Band", "Frequency", "Demod", "Decoder", "Antenna"],
            [
                ["FM Broadcast", "87.5-108 MHz", "WFM", "RDS, HD Radio", "Stock whip"],
                ["AM Broadcast (MW)", "530-1710 kHz", "AM", "-", "Long wire"],
                ["Shortwave Broadcast", "2-30 MHz", "AM", "-", "Long wire"],
            ],
            col_widths=[32*mm, 30*mm, 14*mm, 28*mm, 46*mm],
        ),
        h2("Aviation Bands"),
        make_table(
            ["Band", "Frequency", "Demod", "Decoder", "Antenna"],
            [
                ["Airband Voice", "118-137 MHz", "AM", "ACARS (131.55)", "Vertical dipole"],
                ["ADS-B", "1090 MHz", "RAW", "ADS-B", "1090 MHz antenna"],
                ["ACARS", "131.55 MHz", "AM", "ACARS", "Stock whip"],
            ],
            col_widths=[24*mm, 32*mm, 14*mm, 30*mm, 50*mm],
        ),
        h2("Marine Bands"),
        make_table(
            ["Band", "Frequency", "Demod", "Decoder", "Antenna"],
            [
                ["Marine VHF", "156-162 MHz", "NFM", "-", "Vertical whip"],
                ["AIS", "161.975/162.025 MHz", "NFM", "-", "Vertical whip"],
                ["Ch 16 Distress", "156.8 MHz", "NFM", "-", "Vertical whip"],
            ],
            col_widths=[28*mm, 32*mm, 14*mm, 18*mm, 58*mm],
        ),
        h2("Weather"),
        make_table(
            ["Band", "Frequency", "Demod", "Decoder", "Antenna"],
            [
                ["NOAA WX Radio", "162.4-162.55 MHz", "NFM", "-", "Stock whip"],
                ["NOAA APT", "137.1/137.5/137.9 MHz", "WFM", "APT", "V-dipole or QFH"],
                ["Meteor M2", "137.1/137.9 MHz", "WFM", "Meteor LRPT", "V-dipole or QFH"],
                ["GOES HRIT", "1685.7/1694.1 MHz", "RAW", "GOES HRIT", "10-turn helical + LNA"],
            ],
            col_widths=[28*mm, 38*mm, 14*mm, 26*mm, 44*mm],
        ),
        h2("Ham Radio Bands"),
        make_table(
            ["Band", "Frequency", "Demod", "Notes"],
            [
                ["160m", "1.8-2.0 MHz", "LSB/CW", "Night, long wire"],
                ["80m", "3.5-4.0 MHz", "LSB/CW", "Night, long wire"],
                ["40m", "7.0-7.3 MHz", "LSB/CW", "Day/night, dipole"],
                ["20m", "14.0-14.35 MHz", "USB/CW", "Day, dipole"],
                ["15m", "21.0-21.45 MHz", "USB/CW", "Day, dipole"],
                ["10m", "28.0-29.7 MHz", "USB/CW", "Day, dipole"],
                ["2m", "144-148 MHz", "NFM", "Stock whip"],
                ["70cm", "420-450 MHz", "NFM", "Stock whip"],
            ],
            col_widths=[18*mm, 36*mm, 22*mm, 74*mm],
        ),
        h2("Pager Bands"),
        make_table(
            ["Band", "Frequency", "Demod", "Decoder", "Antenna"],
            [
                ["US Pager", "929-932 MHz", "NFM", "POCSAG", "900 MHz Yagi"],
                ["VHF Pager", "138-174 MHz", "NFM", "POCSAG", "Stock whip"],
            ],
            col_widths=[24*mm, 32*mm, 14*mm, 24*mm, 56*mm],
        ),
        h2("Satellite Bands"),
        make_table(
            ["Band", "Frequency", "Demod", "Decoder", "Antenna"],
            [
                ["Inmarsat STD-C", "1537-1545 MHz", "RAW", "STD-C", "Helical + LNA"],
                ["GPS L1 C/A", "1575.42 MHz", "RAW", "GPS", "Active GPS antenna"],
                ["GOES HRIT", "1685.7 MHz", "RAW", "GOES", "10-turn helical + LNA"],
            ],
            col_widths=[32*mm, 36*mm, 14*mm, 22*mm, 46*mm],
        ),
        h2("Other Useful Frequencies"),
        make_table(
            ["Frequency", "Description", "Demod"],
            [
                ["10 MHz", "WWV time signal (Fort Collins, CO)", "AM"],
                ["15 MHz", "WWV time signal", "AM"],
                ["60 kHz", "WWVB time signal (NIST)", "CW"],
                ["Marine Ch 16", "156.8 MHz", "NFM"],
                ["CB Channel 19", "27.185 MHz", "AM"],
            ],
            col_widths=[30*mm, 84*mm, 26*mm],
        ),
        body(
            "This reference covers the most commonly received frequencies. For a complete "
            "list of frequencies in your area, consult the FCC database (US) or your local "
            "regulator's database. Online resources like radioreference.com also provide "
            "comprehensive frequency lists with user-submitted notes."
        ),
    ]
