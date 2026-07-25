"""
Chapters 11-17: Satellite decoders (APT, Meteor, GOES, POCSAG, ACARS, Inmarsat, GPS).
"""

from reportlab.lib.units import mm
from sdr_doc import (
    mm,
    h1, h2, h3, body, code, callout, tip, warning, hr, make_table,
    PageBreak, MONO_FONT,
)

def chapter11_apt():
    return [
        PageBreak(),
        h1("Chapter 11: NOAA APT Weather Satellites"),
        body(
            "NOAA's polar-orbiting weather satellites (NOAA-15, NOAA-18, NOAA-19) transmit "
            "real-time images of the Earth below them using the APT (Automatic Picture "
            "Transmission) protocol. The satellites pass overhead every 100 minutes or so, "
            "and a single pass produces a 12-minute strip image of the Earth about 2400 "
            "pixels wide and 1500 pixels tall. The console decodes these images live as the "
            "satellite passes overhead."
        ),
        h2("NOAA Satellites and Frequencies"),
        make_table(
            ["Satellite", "Frequency", "Status", "Pass Frequency"],
            [
                ["NOAA-15", "137.620 MHz", "Active", "Every ~100 min"],
                ["NOAA-18", "137.9125 MHz", "Active", "Every ~100 min"],
                ["NOAA-19", "137.100 MHz", "Active", "Every ~100 min"],
            ],
            col_widths=[28*mm, 32*mm, 28*mm, 62*mm],
        ),
        body(
            "These satellites are in sun-synchronous polar orbits at about 850 km altitude. "
            "Each pass overhead lasts 12-15 minutes and covers a swath about 2900 km wide. "
            "To find when a satellite will pass over your location, use the satellite tracker "
            "at n2yo.com or the free Android app &quot;ISS Detector&quot; (which also tracks "
            "NOAA satellites)."
        ),
        h2("APT Signal Structure"),
        body(
            "APT transmits two image channels simultaneously as an AM-modulated 2.4 kHz "
            "subcarrier on the 137 MHz carrier:"
        ),
        make_table(
            ["Channel", "Description", "Typical Use"],
            [
                ["Channel A", "Visible light (0.58-0.68 um)", "Daytime cloud cover"],
                ["Channel B", "Thermal IR (10.5-11.5 um)", "Day/night temperature"],
            ],
            col_widths=[28*mm, 60*mm, 82*mm],
        ),
        body(
            "Each image line is 2080 pixels wide, transmitted at 2 lines per second (0.5 "
            "seconds per line). The line structure is:"
        ),
        make_table(
            ["Segment", "Pixels", "Content"],
            [
                ["Sync A", "39", "7 cycles of black-white-black at 1040 Hz"],
                ["Space A", "0", "Unused gap"],
                ["Channel A", "909", "Visible light image data"],
                ["Sync B", "39", "Same as Sync A"],
                ["Space B", "0", "Unused gap"],
                ["Channel B", "909", "Thermal IR image data"],
                ["Telemetry", "127", "Calibration wedges"],
            ],
            col_widths=[28*mm, 22*mm, 120*mm],
        ),
        h2("How to Receive APT"),
        body("APT reception requires:"),
        body(
            "1. A real RTL-SDR V3 connected (see Chapter 5).<br/>"
            "2. Tune to one of the NOAA frequencies above (e.g. 137.500 MHz for NOAA-19). "
            "The app automatically switches to WFM mode and 180 kHz bandwidth.<br/>"
            "3. A suitable antenna (see below). The stock whip works marginally; a V-dipole "
            "or quadrifilar helix (QFH) is much better.<br/>"
            "4. Wait for a satellite pass. The decoder searches for the sync pattern and "
            "only commits lines when it finds a valid sync - so during a real pass, the "
            "image grows line-by-line in the panel.<br/>"
            "5. Click AUDIO ON if you want to hear the characteristic &quot;tick-tick-tick&quot; "
            "of the APT signal (it sounds like a slow fax machine)."
        ),
        h3("Antenna Recommendations"),
        body(
            "NOAA satellites are in polar orbits, so they pass overhead from horizon to "
            "horizon. You need an antenna with broad reception pattern - a vertical whip "
            "will work but only for high-elevation passes. The best antennas for APT are:"
        ),
        make_table(
            ["Antenna", "Difficulty", "Cost", "Performance"],
            [
                ["Stock whip (vertical)", "Easy", "Included", "Poor - only high passes"],
                ["V-dipole (inclined)", "Easy DIY", "$5", "Good for most passes"],
                ["Quadrifilar helix (QFH)", "Medium DIY", "$15-25", "Excellent - full pass"],
                ["Turnstile (crossed dipoles)", "Medium DIY", "$10-20", "Good - circular polarization"],
                ["Discone", "Buy", "$30-60", "Good - broadband, also works for ADS-B"],
            ],
            col_widths=[40*mm, 28*mm, 24*mm, 68*mm],
        ),
        tip(
            "The V-dipole is the easiest improvement: build two 53 cm wires, mount them in a "
            "V shape at 120 degrees apart, with the open end pointing up at about 30 degrees "
            "from horizontal. Connect one wire to the center conductor and the other to the "
            "shield of your coax. Total cost: under $5."
        ),
        h2("Interpreting the Image"),
        body(
            "The APT image grows line-by-line in the panel as the satellite passes. During "
            "the first few seconds, you will see the sync pattern (alternating black and "
            "white bars) as the decoder locks on. Once locked, the image data appears:"
        ),
        h3("Channel A (visible light, top half)"),
        body(
            "Shows cloud cover and surface features during daytime passes. White areas are "
            "clouds (high albedo); dark areas are open water or land. Coastlines are visible "
            "when there is no cloud cover. This channel only works during daylight - at "
            "night, the channel A image is black."
        ),
        h3("Channel B (thermal IR, bottom half)"),
        body(
            "Shows temperature: bright areas are cold (high clouds, snow), dark areas are "
            "warm (ocean, low land). This channel works day and night. High-altitude clouds "
            "(cumulonimbus tops, jet streams) appear as bright white because they are very "
            "cold (around -50 to -70 degrees C at the tropopause)."
        ),
        h2("What to Expect"),
        body(
            "A typical pass produces an image about 2400 pixels wide and 1500 pixels tall, "
            "covering a swath of about 2900 km. The resolution is about 4 km per pixel at "
            "the satellite's nadir (directly below). At the edges of the pass, the resolution "
            "degrades due to the slant range."
        ),
        callout(
            "If the image appears slanted or curved, your PPM correction is off. Adjust the "
            "PPM slider in the RF &amp; Audio panel until the image straightens out. Once "
            "calibrated, the PPM value is constant for all frequencies."
        ),
        h2("Saving the Image"),
        body(
            "The image data accumulates in the panel during the pass. To save it, right-click "
            "the image and select &quot;Save Image As&quot; - your browser will save the "
            "current state as a PNG file. For best results, wait until the satellite sets "
            "below the horizon (the image stops growing) before saving."
        ),
    ]

def chapter12_meteor():
    return [
        PageBreak(),
        h1("Chapter 12: Meteor M2 LRPT"),
        body(
            "Meteor M2 is a series of Russian weather satellites that transmit digital images "
            "using the LRPT (Low Rate Picture Transmission) protocol. Unlike NOAA's analog "
            "APT, LRPT transmits compressed digital images at 72 kbps, providing higher "
            "resolution (12-bit pixels vs 8-bit) and three spectral channels instead of two. "
            "The console decodes the QPSK signal and reassembles CCSDS CADU frames, which "
            "can be downloaded for offline decompression."
        ),
        h2("Meteor M2 Satellites"),
        make_table(
            ["Satellite", "Frequency", "Status"],
            [
                ["Meteor M2-2", "137.100 MHz", "Active (launched 2019)"],
                ["Meteor M2-3", "137.900 MHz", "Active (launched 2023)"],
            ],
            col_widths=[35*mm, 35*mm, 90*mm],
        ),
        body(
            "Like NOAA, Meteor satellites are in polar orbits at about 820 km altitude, with "
            "passes lasting 12-15 minutes. The orbital inclination is slightly different from "
            "NOAA, so the two constellations often pass at different times - useful for "
            "getting more frequent imagery."
        ),
        h2("LRPT vs APT"),
        body("The key differences between LRPT and NOAA APT:"),
        make_table(
            ["Feature", "NOAA APT", "Meteor M2 LRPT"],
            [
                ["Modulation", "AM (analog)", "QPSK (digital)"],
                ["Bit rate", "N/A (analog)", "72 kbps"],
                ["Image depth", "8-bit grayscale", "12-bit grayscale"],
                ["Channels", "2 (visible + IR)", "3 (visible + 1.6 um + 10.8 um)"],
                ["Compression", "None (line scan)", "JPEG-LS compressed"],
                ["Resolution", "~4 km/pixel", "~1 km/pixel"],
                ["Frame structure", "Continuous line scan", "CCSDS CADU frames"],
            ],
            col_widths=[30*mm, 60*mm, 70*mm],
        ),
        h2("Console Limitations"),
        body(
            "The console decodes the QPSK signal and reassembles CCSDS CADU frames, but does "
            "NOT decompress the image data. Decompression requires JPEG-LS, which is a "
            "specialized lossless/near-lossless compression standard that would require porting "
            "a C library to JavaScript or WebAssembly. Instead, the console accumulates raw "
            "CADU bytes and lets you download them for offline processing with tools like "
            "SatDump or the open-source meteor-decode software."
        ),
        h2("How to Receive Meteor M2"),
        body("Meteor M2 reception requires:"),
        body(
            "1. A real RTL-SDR V3 connected (see Chapter 5).<br/>"
            "2. Tune to 137.100 MHz (Meteor M2-2) or 137.900 MHz (Meteor M2-3). The console "
            "automatically detects the band and shows the Meteor panel.<br/>"
            "3. The same V-dipole or QFH antenna used for NOAA APT works for Meteor (both are "
            "at 137 MHz).<br/>"
            "4. Wait for a satellite pass. The panel shows sync lock status, EVM (Error "
            "Vector Magnitude) as a signal quality metric, and accumulated frame count.<br/>"
            "5. When frames are being received, click DOWNLOAD CADU to save the raw bytes "
            "to a .bin file for offline decompression."
        ),
        h2("Interpreting the Display"),
        h3("CADU Frame Count"),
        body(
            "Total CCSDS CADU frames decoded since the decoder started. Each frame is 1024 "
            "bytes. A full pass typically produces 5000-10000 frames (5-10 MB of data)."
        ),
        h3("EVM (Error Vector Magnitude)"),
        body(
            "A measure of signal quality - the average distance between received QPSK symbols "
            "and their ideal positions. Lower is better: under 20% is good, under 10% is "
            "excellent. Above 40%, the decoder will struggle to maintain sync."
        ),
        h3("Bytes Received"),
        body(
            "Total raw bytes accumulated in the rolling buffer (1 MB max). When you click "
            "DOWNLOAD CADU, this buffer is saved to a file."
        ),
        h2("Post-Processing"),
        body(
            "To decompress the downloaded CADU data into viewable images, use one of these "
            "tools:"
        ),
        make_table(
            ["Tool", "Platform", "URL"],
            [
                ["SatDump", "Cross-platform", "github.com/SatDump/SatDump"],
                ["Meteor Decoder", "Linux/Mac", "github.com/altusa/meteor_decoder"],
                ["LRPT-Decoder", "Windows", "github.com/dbdexter/lrpt_decoder"],
            ],
            col_widths=[40*mm, 35*mm, 85*mm],
        ),
        body(
            "SatDump is the most polished option - it accepts the raw .bin file and produces "
            "PNG images with the three spectral channels. The decompression takes a few "
            "seconds on a modern CPU."
        ),
    ]

def chapter13_goes():
    return [
        PageBreak(),
        h1("Chapter 13: GOES HRIT"),
        body(
            "GOES (Geostationary Operational Environmental Satellite) is the US weather "
            "satellite system that provides continuous coverage of the Western Hemisphere "
            "from geostationary orbit. The GOES-R series satellites (GOES-16 East and "
            "GOES-17/18 West) transmit HRIT (High Rate Information Transmission) signals "
            "containing full-disk Earth images every 3 hours, regional images every 15 "
            "minutes, text bulletins, and EMWIN weather data."
        ),
        h2("GOES Satellites and Frequencies"),
        make_table(
            ["Satellite", "Frequency", "Location", "Coverage"],
            [
                ["GOES-16 (East)", "1685.7 MHz", "75.2 W", "Atlantic, Americas"],
                ["GOES-17/18 (West)", "1694.1 MHz", "137.2 W", "Pacific, Western US"],
            ],
            col_widths=[35*mm, 30*mm, 30*mm, 65*mm],
        ),
        body(
            "GOES satellites are geostationary, meaning they appear fixed in the sky at about "
            "35,786 km altitude. Once you point your antenna at them, you can receive 24/7 - "
            "no waiting for satellite passes."
        ),
        h2("HRIT Signal Structure"),
        body(
            "HRIT transmits at 927 kbps using BPSK modulation with the following frame "
            "structure:"
        ),
        make_table(
            ["Component", "Size", "Description"],
            [
                ["Sync word", "32 bits", "0x1ACFFC1D (CCSDS standard)"],
                ["CADU frame", "1024 bytes", "Channel Access Data Unit"],
                ["Viterbi coding", "Rate 1/2, K=7", "Forward error correction"],
                ["Reed-Solomon", "RS(255, 223)", "Additional error correction"],
            ],
            col_widths=[40*mm, 35*mm, 85*mm],
        ),
        body(
            "Files are assembled from multiple CADU frames. The HRIT primary header (first 10 "
            "bytes after the sync) indicates the file type, total file size, and a unique file "
            "name. The console parses these headers to track ongoing file reception."
        ),
        h2("File Types"),
        body("GOES HRIT transmits several file types:"),
        make_table(
            ["Type", "Description", "Frequency"],
            [
                ["Image", "Full-disk or regional Earth image", "Every 3 hours (full disk)"],
                ["Text", "Weather bulletins and forecasts", "Variable"],
                ["JPEG-LS", "Compressed image data", "Variable"],
                ["EMWIN", "Emergency Managers Weather Info", "Continuous"],
                ["DCS", "Data Collection System (sensor data)", "Variable"],
            ],
            col_widths=[24*mm, 80*mm, 56*mm],
        ),
        h2("Antenna Requirements"),
        body(
            "GOES HRIT is a weak signal that requires a directional antenna and a low-noise "
            "amplifier (LNA). The stock RTL-SDR whip will NOT work. Recommended antennas:"
        ),
        make_table(
            ["Antenna", "Gain", "Difficulty", "Cost"],
            [
                ["10-turn helical", "13-15 dBi", "Medium DIY", "$30-50"],
                ["60cm dish + patch feed", "20+ dBi", "Hard", "$80-150"],
                ["Commercial GOES dish", "24 dBi", "Buy", "$200-400"],
            ],
            col_widths=[42*mm, 24*mm, 28*mm, 26*mm],
        ),
        body(
            "The antenna must be pointed at the satellite with an accuracy of about 5 "
            "degrees. For a helical, this means manual aiming based on the satellite's "
            "azimuth and elevation from your location (use an online satellite look-angle "
            "calculator). For a dish, a small motorized positioner is helpful."
        ),
        warning(
            "An LNA (low-noise amplifier, ~$20-30) is essential. Place it directly at the "
            "antenna feed - before any coax - to overcome coax losses. Without an LNA, you "
            "will not receive anything. The RTL-SDR's internal noise figure is too high for "
            "the weak GOES signal."
        ),
        h2("How to Receive GOES HRIT"),
        body("GOES HRIT reception requires:"),
        body(
            "1. A real RTL-SDR V3 connected (see Chapter 5).<br/>"
            "2. A directional antenna (helical or dish) with LNA, pointed at the satellite.<br/>"
            "3. Tune to 1685.7 MHz (GOES-East) or 1694.1 MHz (GOES-West).<br/>"
            "4. Set sample rate to 2.4 Msps, gain to maximum, AGC off.<br/>"
            "5. The GOES panel appears automatically when tuned to 1680-1700 MHz."
        ),
        h2("Interpreting the Display"),
        h3("Frame Count and Bytes"),
        body(
            "Shows the total CADU frames decoded and the total bytes accumulated. A healthy "
            "GOES signal produces 800-1000 frames per second (927 kbps / 1024 bytes per "
            "frame). If you are not getting frames, your antenna is not pointed correctly or "
            "the LNA is not powered."
        ),
        h3("Bit Error Rate (BER)"),
        body(
            "After Viterbi decoding, the bit error rate should be under 1% for reliable file "
            "reception. Higher BER indicates a weak signal or mis-pointed antenna. The "
            "Reed-Solomon FEC can correct up to 16 byte errors per 255-byte codeword, so "
            "even with a moderate BER you can still receive files correctly."
        ),
        h3("Current File"),
        body(
            "When a file is being received, the panel shows the file type, a progress bar "
            "indicating how many bytes have been received out of the total, and the expected "
            "total size. Full-disk Earth images are typically 8-12 MB and take 15-20 minutes "
            "to receive."
        ),
        h3("Completed Files"),
        body(
            "Lists up to 20 most recently completed files with type, size, and timestamp. "
            "These files are stored in the bridge's <font name='%s'>recordings/</font> "
            "directory and can be downloaded via the HTTP server (see Chapter 6)." % MONO_FONT
        ),
        h2("Post-Processing"),
        body(
            "GOES HRIT image files use a custom image format that needs to be decoded into "
            "viewable PNGs. The goestools package (Linux/macOS) or SatDump can do this "
            "conversion. The decompressed images are typically 1080p grayscale (single "
            "channel) or false-color composites of multiple spectral bands."
        ),
    ]

def chapter14_pocsag():
    return [
        PageBreak(),
        h1("Chapter 14: POCSAG Pagers"),
        body(
            "POCSAG (Post Office Code Standardization Advisory Group) is the standard "
            "protocol for one-way pagers, still widely used by hospitals, fire departments, "
            "emergency services, and IT alerting systems. Despite the rise of smartphones, "
            "pagers remain popular in environments where cellular service is unreliable or "
            "where messages must reach recipients instantly without acknowledgement delays. "
            "The console decodes POCSAG messages in real time."
        ),
        h2("POCSAG Signal Structure"),
        body(
            "POCSAG transmits at three standard baud rates (512, 1200, and 2400 bps) using "
            "2-FSK (Frequency Shift Keying) modulation with ±4.5 kHz deviation. The frame "
            "structure is:"
        ),
        make_table(
            ["Component", "Size", "Description"],
            [
                ["Preamble", "576 bits", "Alternating 1-0 pattern for synchronization"],
                ["Sync word", "32 bits", "0x7CD215D8 (frame sync)"],
                ["Batches", "16 codewords", "1 address + 15 data, or all data"],
                ["Codeword", "32 bits", "1 bit type + 18 bits address/data + 10 BCH + 1 parity"],
            ],
            col_widths=[28*mm, 28*mm, 104*mm],
        ),
        h2("Frequencies"),
        body("POCSAG pagers operate on several bands:"),
        make_table(
            ["Band", "Frequency Range", "Common Users"],
            [
                ["US Pager Band", "929-932 MHz", "Commercial, hospital, fire/EMS"],
                ["VHF", "138-174 MHz", "Some fire/EMS, business"],
                ["UHF", "440-470 MHz", "IT alerting, hospitals"],
            ],
            col_widths=[28*mm, 35*mm, 97*mm],
        ),
        h2("Message Types"),
        body("POCSAG messages come in three types, indicated by the function code bits:"),
        make_table(
            ["Type", "Code", "Description", "Encoding"],
            [
                ["Numeric", "0", "Numeric-only message (phone numbers, codes)", "BCD, 5 digits per codeword"],
                ["Tone", "1", "Beep only (no message content)", "Empty"],
                ["Alphanumeric", "2 or 3", "Text message (ASCII)", "7-bit ASCII, 3 chars per codeword"],
            ],
            col_widths=[28*mm, 14*mm, 80*mm, 38*mm],
        ),
        h2("How to Receive POCSAG"),
        body("POCSAG reception requires:"),
        body(
            "1. A real RTL-SDR V3 connected (see Chapter 5).<br/>"
            "2. Tune to a pager frequency. The US pager band (929-932 MHz) is most active. "
            "The console auto-detects the band and shows the Messages panel with the Pagers "
            "tab selected.<br/>"
            "3. The stock RTL-SDR whip works for nearby pager towers. For better range, a "
            "900 MHz Yagi is recommended.<br/>"
            "4. Set demod mode to NFM with 25 kHz bandwidth.<br/>"
            "5. Watch the Messages panel - decoded messages appear in real time with the "
            "pager address (the destination pager ID), function code, and message text."
        ),
        h2("Interpreting Messages"),
        h3("Pager Address"),
        body(
            "Each pager has a unique 7-digit address (sometimes called a CAP code or RIC). "
            "Messages are addressed to specific pagers, and only the addressed pager will "
            "display the message. The console shows the address of each received message."
        ),
        h3("Numeric Messages"),
        body(
            "Numeric messages are typically phone numbers (the recipient is expected to call "
            "back) or short numeric codes (e.g. 911 for emergency, 4 for &quot;call the "
            "office&quot;). The BCD encoding uses a special character set that includes U "
            "(empty), -, ), and ( in addition to digits 0-9."
        ),
        h3("Alphanumeric Messages"),
        body(
            "Alphanumeric messages are 7-bit ASCII text. They can be up to several hundred "
            "characters long, requiring multiple codewords. Common examples include dispatch "
            "messages (&quot;Engine 5 respond to 123 Main St for structure fire&quot;), IT "
            "alerts (&quot;Server SRV-01 CPU at 95%&quot;), and hospital pages "
            "(&quot;Dr. Smith call extension 4521&quot;)."
        ),
        warning(
            "Pager messages may contain sensitive personal or medical information. Be aware "
            "of privacy considerations when sharing or storing decoded messages. In some "
            "jurisdictions, intercepting pager traffic may be subject to legal restrictions. "
            "Check your local laws."
        ),
        h2("Performance Notes"),
        body(
            "The POCSAG decoder supports all three baud rates (512, 1200, 2400 bps) and "
            "automatically detects the rate by trying all three. The decoder uses a 1-bit "
            "error tolerance on the sync word to handle noisy signals. BCH parity checking "
            "is not strictly enforced (we tolerate some false positives in exchange for "
            "catching marginal messages)."
        ),
        body(
            "In a typical urban area, you can expect 5-50 messages per minute during peak "
            "hours. Rural areas may produce only a few messages per hour. The decoder "
            "keeps the last 100 messages in the panel - older messages are dropped."
        ),
    ]

def chapter15_acars():
    return [
        PageBreak(),
        h1("Chapter 15: ACARS Aircraft Messaging"),
        body(
            "ACARS (Aircraft Communications Addressing and Reporting System) is a digital "
            "short-message system used by airlines to exchange text messages between aircraft "
            "and dispatchers. It operates on VHF (131.55 MHz primary, plus 131.725 and "
            "131.825 MHz) and via satellite (Inmarsat). The console decodes the VHF ACARS "
            "signals, providing real-time visibility into aircraft-to-ground communications."
        ),
        h2("ACARS Signal Structure"),
        body(
            "ACARS transmits at 2400 bps using MSK (Minimum Shift Keying) modulation, which "
            "is a special case of FSK with deviation exactly half the bit rate. The bit "
            "stream is NRZI encoded (Non-Return-to-Zero Inverted: a 0 bit is a transition, "
            "a 1 bit is no transition). The frame structure is:"
        ),
        make_table(
            ["Field", "Size", "Description"],
            [
                ["Bit sync", "16 bits", "Alternating 1-0 pattern"],
                ["Preamble", "Variable", "Frame start marker"],
                ["Mode", "1 byte", "1=downlink, 2=uplink"],
                ["Flight ID", "6 bytes", "Flight identifier (e.g. UAL123)"],
                ["Aircraft reg", "7 bytes", "Tail number (e.g. N123AB)"],
                ["Message label", "2 bytes", "Message type code"],
                ["Message number", "4 bytes", "Sequence number (e.g. M01A)"],
                ["Message text", "Variable", "Free-form ASCII text"],
                ["ETX", "1 byte", "End-of-text marker"],
            ],
            col_widths=[32*mm, 22*mm, 106*mm],
        ),
        h2("Message Labels"),
        body("ACARS messages are categorized by 2-character labels:"),
        make_table(
            ["Label", "Description"],
            [
                ["H1", "Position report (routine)"],
                ["H2", "Position report (request)"],
                ["Q0", "ACARS system message"],
                ["Q1", "Cancel downlink"],
                ["Q3", "Oceanic request"],
                ["10", "Weather request"],
                ["11", "Weather data"],
                ["15", "Free text message"],
                ["13", "Engine data"],
                ["5U", "Out/Off/On/In (OOOI) report"],
            ],
            col_widths=[22*mm, 138*mm],
        ),
        h2("How to Receive ACARS"),
        body("ACARS reception requires:"),
        body(
            "1. A real RTL-SDR V3 connected (see Chapter 5).<br/>"
            "2. Tune to 131.55 MHz (primary ACARS channel). The console auto-detects and "
            "shows the Messages panel with the ACARS tab selected.<br/>"
            "3. Set demod mode to AM with 12 kHz bandwidth.<br/>"
            "4. The stock RTL-SDR whip works for ACARS if you are within 50 miles of an "
            "airport or major flight path. For better range, a VHF airband antenna is "
            "recommended.<br/>"
            "5. Watch the Messages panel - ACARS messages appear in real time with the "
            "flight ID, aircraft registration, message label, and text body."
        ),
        h2("Interpreting Messages"),
        h3("OOOI Reports"),
        body(
            "OOOI stands for Out, Off, On, In - the four phases of flight. ACARS sends an OOOI "
            "message at each phase transition: Out (pushback from gate), Off (wheels up), "
            "On (wheels down at destination), In (arrival at gate). These messages let "
            "airlines track flight progress automatically."
        ),
        h3("Position Reports"),
        body(
            "Aircraft send periodic position reports (label H1) containing latitude, "
            "longitude, altitude, and time. These are typically sent every 5-10 minutes "
            "during cruise. Some airlines send them more frequently over oceanic routes."
        ),
        h3("Free Text Messages"),
        body(
            "Free text messages (label 15) are used for ad-hoc communication between pilots "
            "and dispatchers. Common examples include weather diversions, gate assignments, "
            "mechanical issues, and passenger requests."
        ),
        h2("Realistic Expectations"),
        body(
            "ACARS activity is highest near major airports and on busy air routes. In a "
            "typical urban area within 50 miles of a major airport, you can expect 10-50 "
            "messages per hour. Rural areas away from flight paths may produce only a few "
            "messages per day. Messages are typically short (50-200 characters) and arrive "
            "in bursts when multiple aircraft are in range."
        ),
        tip(
            "Pair ACARS decoding with ADS-B (Chapter 10) for a complete aircraft monitoring "
            "setup. ADS-B shows aircraft positions on the radar plot, while ACARS shows the "
            "text messages each aircraft is exchanging with dispatchers."
        ),
    ]

def chapter16_inmarsat():
    return [
        PageBreak(),
        h1("Chapter 16: Inmarsat STD-C"),
        body(
            "Inmarsat-C is a store-and-forward messaging service used by maritime vessels, "
            "remote assets, and aviation for low-bandwidth text communication. The satellites "
            "are geostationary at L-band (1537-1545 MHz), and the system supports marine "
            "distress alerts (GMDSS), ship-to-shore email, and asset tracking. The console "
            "decodes the STD-C (Standard-C) TDM channel, which is the always-on broadcast "
            "from the Network Coordination Station."
        ),
        h2("Inmarsat Satellites"),
        make_table(
            ["Satellite", "Position", "Frequency", "Coverage"],
            [
                ["I-3 AOR-E", "15.5 W", "1543.5 MHz", "Atlantic East, Europe, Africa"],
                ["I-3 AOR-W", "54 W", "1543.5 MHz", "Atlantic West, Americas"],
                ["I-3 IOR", "64 E", "1537.5 MHz", "Indian Ocean, Asia, Australia"],
                ["I-3 POR", "178 E", "1537.5 MHz", "Pacific Ocean"],
            ],
            col_widths=[28*mm, 22*mm, 30*mm, 100*mm],
        ),
        body(
            "Each satellite is in geostationary orbit at about 35,786 km altitude. The "
            "satellite you can receive depends on your location - find the nearest one "
            "and point your antenna at it."
        ),
        h2("STD-C Signal Structure"),
        body(
            "STD-C transmits at 1200 bps using BPSK modulation with the following frame "
            "structure:"
        ),
        make_table(
            ["Component", "Size", "Description"],
            [
                ["Frame duration", "8.64 seconds", "One TDM frame"],
                ["Total bits", "10,368", "Per frame"],
                ["Channels", "12", "Per frame"],
                ["Channel size", "864 bits", "108 bytes per channel"],
                ["Bulletin board", "Channel 1", "NCS ID + LES assignments"],
                ["Convolutional code", "Rate 1/2, K=7", "Forward error correction"],
            ],
            col_widths=[36*mm, 32*mm, 92*mm],
        ),
        h2("Antenna Requirements"),
        body(
            "Inmarsat STD-C is a weak L-band signal requiring a directional antenna with "
            "circular polarization and an LNA. The stock RTL-SDR whip will NOT work. "
            "Recommended antennas:"
        ),
        make_table(
            ["Antenna", "Gain", "Difficulty", "Cost"],
            [
                ["Patch antenna (RHCP)", "6-9 dBi", "Easy DIY", "$15-25"],
                ["Helical (4-turn)", "10-12 dBi", "Medium DIY", "$25-40"],
                ["Helical (8-turn)", "13-15 dBi", "Medium DIY", "$35-50"],
                ["Commercial Inmarsat antenna", "10-15 dBi", "Buy", "$80-200"],
            ],
            col_widths=[42*mm, 24*mm, 28*mm, 36*mm],
        ),
        body(
            "The antenna must be pointed at the satellite with an accuracy of about 10 "
            "degrees. Use an online satellite look-angle calculator to determine azimuth and "
            "elevation from your location. An LNA (~$20-30) is essential - place it directly "
            "at the antenna feed, before any coax."
        ),
        h2("How to Receive Inmarsat STD-C"),
        body("STD-C reception requires:"),
        body(
            "1. A real RTL-SDR V3 connected (see Chapter 5).<br/>"
            "2. A directional antenna (patch or helical) with LNA, pointed at the satellite.<br/>"
            "3. Tune to 1537.5 MHz (IOR/POR) or 1543.5 MHz (AOR-E/AOR-W). The Inmarsat "
            "panel appears automatically.<br/>"
            "4. Set sample rate to 2.4 Msps, gain to maximum, AGC off.<br/>"
            "5. The panel shows NCS ID, active LES list, and any decoded messages."
        ),
        h2("Interpreting the Display"),
        h3("NCS ID"),
        body(
            "The Network Coordination Station ID. There is one NCS per satellite region "
            "(typically 4 NCS stations globally). The NCS broadcasts the bulletin board "
            "that announces which Land Earth Stations (LES) are active."
        ),
        h3("LES List"),
        body(
            "Land Earth Stations are the ground stations that route messages to and from "
            "the satellites. Each LES has a unique 4-digit hex ID. Active LES IDs are "
            "announced in the bulletin board. When a message is sent from a vessel, the "
            "LES that handles it is logged in the message header."
        ),
        h3("Messages"),
        body(
            "Decoded messages are listed with the sender (LES ID), timestamp, and text "
            "content. Common message types include:"
        ),
        body(
            "- GMDSS distress alerts (maritime emergencies)<br/>"
            "- Maritime safety information (MSI)<br/>"
            "- Fleet management messages<br/>"
            "- Asset tracking pings<br/>"
            "- Email gateway messages"
        ),
        warning(
            "Inmarsat STD-C messages may contain sensitive maritime safety or commercial "
            "information. Be aware of privacy considerations when sharing decoded messages. "
            "GMDSS distress alerts should be reported to authorities if received."
        ),
        h2("Realistic Expectations"),
        body(
            "STD-C activity depends on the satellite you can receive and the time of day. "
            "AOR-E and IOR are typically busiest (covering Europe and Asia respectively). "
            "Expect 1-10 messages per hour in a 24-hour period - much lower than ACARS or "
            "POCSAG. The TDM channel itself is always broadcasting (you will see the NCS "
            "ID quickly), but actual messages are sparse."
        ),
    ]

def chapter17_gps():
    return [
        PageBreak(),
        h1("Chapter 17: GPS L1 C/A Decoder"),
        body(
            "The Global Positioning System broadcasts civil signals on the L1 frequency "
            "(1575.42 MHz) using CDMA (Code Division Multiple Access) spread-spectrum "
            "modulation. Each of the 32 GPS satellites broadcasts a unique 1023-chip Gold "
            "code at 1.023 Mchips/second, with a 50 bps navigation message on top. The "
            "console generates the C/A codes for PRN 1-12 and attempts to acquire and "
            "track each satellite, showing signal strength (C/N0) and pseudoranges."
        ),
        h2("GPS Signal Structure"),
        body(
            "The L1 C/A (Coarse/Acquisition) signal has the following characteristics:"
        ),
        make_table(
            ["Parameter", "Value"],
            [
                ["Carrier frequency", "1575.42 MHz (L1)"],
                ["Code rate", "1.023 Mchips/s"],
                ["Code length", "1023 chips (1 ms repeat)"],
                ["Code type", "Gold code (PRN 1-32)"],
                ["Modulation", "BPSK on spread code"],
                ["Nav message rate", "50 bps"],
                ["Nav message length", "25 frames x 5 subframes x 10 bits = 12.5 min"],
                ["Satellites in orbit", "31 active (PRN 1-32, with gaps)"],
            ],
            col_widths=[55*mm, 105*mm],
        ),
        h2("C/A Code Generation"),
        body(
            "Each GPS satellite's C/A code is generated by XORing two LFSRs (Linear "
            "Feedback Shift Registers) called G1 and G2:"
        ),
        body(
            "<b>G1 polynomial:</b> x^10 + x^3 + 1 (taps at positions 3 and 10)<br/>"
            "<b>G2 polynomial:</b> x^10 + x^9 + x^8 + x^6 + x^3 + x^2 + 1 (taps at 2, 3, 6, 8, 9, 10)<br/><br/>"
            "Each satellite uses a different pair of G2 taps (the &quot;phase selection&quot;) "
            "to produce its unique Gold code. For example, PRN-1 uses taps 2 and 6, PRN-2 "
            "uses taps 3 and 7, and so on. The full table of 32 tap pairs is defined in "
            "ICD-GPS-200C. The console implements all 12 most active PRNs."
        ),
        h2("Acquisition Process"),
        body(
            "To acquire a GPS satellite, the decoder must find two unknowns simultaneously:"
        ),
        h3("Doppler Shift"),
        body(
            "GPS satellites move at about 3.9 km/s, causing Doppler shifts of up to ±5 kHz "
            "on the L1 carrier. The decoder searches Doppler in 500 Hz steps, mixing the "
            "received signal down by each candidate Doppler frequency."
        ),
        h3("Code Phase"),
        body(
            "The 1023-chip C/A code repeats every 1 ms. The decoder must find the exact "
            "code phase (which chip is being received at which moment). This is done by "
            "correlating the received signal against the local code at each of 1023 possible "
            "code phases."
        ),
        body(
            "When both Doppler and code phase match, the correlation produces a sharp peak. "
            "If the peak exceeds a threshold (corresponding to about 30 dB-Hz C/N0), the "
            "satellite is acquired and tracking begins."
        ),
        h2("Tracking"),
        body(
            "Once acquired, the decoder tracks the satellite by continuously correlating "
            "the received signal with the local code at the tracked Doppler and code phase. "
            "Small adjustments keep the correlation peak centered as the satellite moves. "
            "The integrated correlation over 20 ms produces one nav message bit (50 bps)."
        ),
        h2("Antenna Requirements"),
        body(
            "GPS signals are extremely weak (-130 dBm at the Earth's surface) and require an "
            "active antenna with built-in LNA. The stock RTL-SDR whip will NOT work. "
            "Recommended antennas:"
        ),
        make_table(
            ["Antenna", "Type", "Cost", "Notes"],
            [
                ["Active GPS patch", "MCX connector", "$5-15", "Standard, works well"],
                ["Active GPS ceramic", "SMA connector", "$8-20", "Smaller, similar performance"],
                ["External GPS antenna", "Roof-mounted", "$20-50", "Best for indoor receivers"],
            ],
            col_widths=[36*mm, 28*mm, 22*mm, 74*mm],
        ),
        body(
            "Most active GPS antennas have an MCX or SMA connector that plugs directly into "
            "the RTL-SDR V3's antenna jack (with an adapter if needed). The antenna is "
            "powered by DC injected onto the coax (typically 3-5V). The RTL-SDR V3 has a "
            "software-controlled bias tee that can provide this - check the Hardware Source "
            "panel for a &quot;Bias Tee&quot; option (if not available, you need an external "
            "bias tee)."
        ),
        warning(
            "Without a clear view of the sky, GPS reception is very poor. Indoors you may "
            "get 0-2 satellites with weak signal. Outdoors with a clear sky view, you can "
            "expect 6-12 satellites at good strength."
        ),
        h2("How to Receive GPS"),
        body("GPS reception requires:"),
        body(
            "1. A real RTL-SDR V3 connected with an active GPS antenna (see above).<br/>"
            "2. Tune to 1575.42 MHz. The GPS panel appears automatically when tuned to "
            "1570-1580 MHz.<br/>"
            "3. Set sample rate to 2.4 Msps (default).<br/>"
            "4. Set gain to maximum, AGC off.<br/>"
            "5. The panel shows up to 12 satellites (PRN 1-12) with their tracking status, "
            "C/N0, Doppler shift, and pseudorange."
        ),
        h2("Interpreting the Display"),
        h3("Per-PRN Status"),
        body(
            "Each satellite shows one of three states:"
        ),
        make_table(
            ["State", "Description"],
            [
                ["SRCH", "Searching - correlating against the satellite's C/A code"],
                ["TRK", "Tracking - acquired and tracking, decoding nav bits"],
            ],
            col_widths=[20*mm, 140*mm],
        ),
        h3("C/N0"),
        body(
            "Carrier-to-noise density ratio in dB-Hz. This is the standard GPS signal "
            "strength metric. Values: 30+ dB-Hz = usable, 35+ dB-Hz = good, 40+ dB-Hz = "
            "excellent. Below 28 dB-Hz, the signal is too weak to track."
        ),
        h3("Doppler Shift"),
        body(
            "The Doppler shift in Hz, positive or negative. This changes as the satellite "
            "moves across the sky. Range is ±5000 Hz for typical GPS satellites."
        ),
        h3("Pseudorange"),
        body(
            "An estimate of the distance to the satellite in megameters (millions of meters). "
            "GPS satellites orbit at about 20,200 km, so pseudoranges should be around "
            "20,000-25,000 Mm. The pseudorange is computed from the code phase: "
            "(code phase / 1.023 Mchips/s) * speed of light."
        ),
        h2("Position Fixing"),
        body(
            "A full GPS position fix requires 4+ satellites with valid ephemeris data "
            "(satellite positions decoded from the nav message) and trilateration. The "
            "console does NOT compute a position fix - it tracks satellites and shows "
            "signal strength + pseudoranges, but does not parse the ephemeris or perform "
            "trilateration. This is left as a future enhancement. To get an actual position "
            "fix, use a dedicated GPS app or library."
        ),
        h2("Realistic Expectations"),
        body(
            "With a proper active GPS antenna and clear sky view, you can expect to acquire "
            "6-12 satellites within 30-60 seconds. Without a clear sky view (indoors, near "
            "buildings), you may only acquire 0-3 satellites. The decoder searches for "
            "satellites continuously, so newly risen satellites are acquired automatically."
        ),
    ]
