"""
Chapters 6-17: Bridge protocol + all 11 decoder chapters.
"""

from reportlab.lib.units import mm
from sdr_doc import (
    mm,
    h1, h2, h3, body, code, callout, tip, warning, hr, make_table,
    PageBreak, MONO_FONT,
)

def chapter6():
    return [
        PageBreak(),
        h1("Chapter 6: The Bridge - Protocol &amp; Internals"),
        body(
            "The bridge is a small Node.js script that connects to <font name='%s'>rtl_tcp</font> "
            "on one side and exposes the IQ stream over WebSocket on the other. It also runs an "
            "HTTP server for serving recorded IQ files and syncing bookmarks. This chapter "
            "documents the wire protocol so you can write your own client, extend the bridge, or "
            "integrate it into other software." % MONO_FONT
        ),
        h2("Command Line Options"),
        make_table(
            ["Flag", "Default", "Description"],
            [
                ["--rtl-host", "127.0.0.1", "Host where rtl_tcp is running"],
                ["--rtl-port", "1234", "Port rtl_tcp is listening on"],
                ["--ws-host", "0.0.0.0", "Bind address for the WebSocket server"],
                ["--ws-port", "8080", "Port for the WebSocket server"],
                ["--tls", "(off)", "Enable TLS (wss://). Auto-generates a self-signed cert."],
                ["--cert", "(auto)", "Path to TLS certificate (with --tls)"],
                ["--key", "(auto)", "Path to TLS private key (with --tls)"],
                ["--http-port", "8081", "Port for the HTTP server (recordings, presets)"],
            ],
            col_widths=[28*mm, 28*mm, 114*mm],
        ),
        h2("WebSocket Protocol"),
        body("The bridge speaks a simple JSON + binary protocol over a single WebSocket connection."),
        h3("Client to Server (JSON text frames)"),
        body("The browser sends JSON commands to control the SDR:"),
        code(
            '{"type":"set_frequency","hz":91500000}\n'
            '{"type":"set_sample_rate","hz":2400000}\n'
            '{"type":"set_gain","db":30}\n'
            '{"type":"set_gain","db":"auto"}\n'
            '{"type":"set_ppm","ppm":0}\n'
            '{"type":"start"}\n'
            '{"type":"stop"}\n'
            '{"type":"status"}\n'
            '{"type":"start_recording"}\n'
            '{"type":"stop_recording"}'
        ),
        h3("Server to Client (JSON text frames)"),
        body(
            "The bridge periodically broadcasts status messages (every 500 ms) and sends "
            "recording-complete notifications:"
        ),
        code(
            '{"type":"status","payload":{\n'
            '  "connected":true,"deviceName":"RTL-SDR V3 (R820T2)",\n'
            '  "frequency":91500000,"sampleRate":2400000,\n'
            '  "gainDb":30,"ppm":0,"gains":[],\n'
            '  "overruns":0,"uptime":42.3,\n'
            '  "recording":null\n'
            '}}'
        ),
        h3("Server to Client (binary frames)"),
        body("IQ data is sent as binary frames with a 16-byte little-endian header followed by raw IQ bytes:"),
        make_table(
            ["Offset", "Type", "Field"],
            [
                ["0", "uint32 LE", "Sample rate in Hz"],
                ["4", "uint32 LE", "Frequency - low 32 bits (Hz)"],
                ["8", "uint32 LE", "Frequency - high 32 bits (always 0 for RTL-SDR)"],
                ["12", "uint32 LE", "Timestamp (ms, truncated to 32 bits)"],
                ["16+", "bytes", "Interleaved unsigned 8-bit I/Q pairs (I,Q,I,Q,...)"],
            ],
            col_widths=[18*mm, 28*mm, 124*mm],
        ),
        body(
            "Each IQ sample is two bytes: I (in-phase) and Q (quadrature), both unsigned 8-bit "
            "centered on 127. To convert to signed float, subtract 128 and divide by 128. The "
            "frames are sent in 32 KB chunks (16K complex samples) every 50 ms, giving a steady "
            "data rate of about 640 KB/s at 2.4 Msps."
        ),
        h2("HTTP Server Endpoints"),
        body("The bridge also runs an HTTP server on port 8081 (ws_port + 1) for file operations:"),
        make_table(
            ["Endpoint", "Method", "Description"],
            [
                ["/health", "GET", "Returns JSON {ok:true, ws:..., port:...}"],
                ["/recordings", "GET", "Lists saved IQ recordings (JSON array)"],
                ["/recordings/{name}", "GET", "Downloads a specific recording file"],
                ["/presets", "GET", "Returns saved bookmarks JSON"],
                ["/presets", "PUT", "Saves bookmarks JSON to presets.json"],
            ],
            col_widths=[42*mm, 22*mm, 106*mm],
        ),
        h2("RTL-SDR Command Bytes"),
        body(
            "The bridge forwards commands to rtl_tcp using its native binary protocol. Each "
            "command is 5 bytes: 1 byte command code + 4 bytes big-endian value. The command "
            "codes used by the bridge are:"
        ),
        make_table(
            ["Code", "Constant", "Description"],
            [
                ["1", "SET_FREQUENCY", "Tune to a frequency in Hz"],
                ["2", "SET_SAMPLE_RATE", "Set the sample rate in Hz"],
                ["3", "SET_GAIN_MODE", "0=manual, 1=auto (AGC)"],
                ["4", "SET_GAIN", "Manual gain in tenths of a dB (e.g. 300 = 30.0 dB)"],
                ["5", "SET_FREQ_CORRECTION", "PPM correction (signed)"],
            ],
            col_widths=[15*mm, 50*mm, 105*mm],
        ),
        body(
            "The full rtl_tcp command set is documented at the osmocom.org wiki. The bridge "
            "implements only the subset needed by the web app; additional commands (like "
            "SET_TUNER_GAIN_BY_INDEX or GET_TUNER_GAINS) can be added by extending the "
            "switch statement in the bridge's message handler."
        ),
        h2("Recording Format"),
        body(
            "When you click RECORD in the IQ Recording panel, the bridge starts writing raw IQ "
            "bytes to a file in the <font name='%s'>recordings/</font> directory next to the "
            "bridge script. The file format is header-less: just raw interleaved unsigned 8-bit "
            "I/Q pairs, exactly as received from rtl_tcp. Files are named with the format: "
            "<font name='%s'>iq-{ISO timestamp}-{frequency}MHz-{sampleRate}ksps.raw</font>." % (MONO_FONT, MONO_FONT)
        ),
        body(
            "These files are compatible with SDR#, GQRX, GNU Radio, and most other SDR software. "
            "To replay a recording in SDR#: select File -&gt; Play, choose &quot;Raw IQ File&quot;, "
            "set the sample format to &quot;8-bit unsigned&quot;, and enter the original sample "
            "rate. In GNU Radio, use a File Source block with item type &quot;complex&quot; and "
            "vector length 1, then multiply by 1/128 and subtract 1 to convert to float."
        ),
        h2("Extending the Bridge"),
        body(
            "The bridge is a single 280-line JavaScript file with no build step. To add a new "
            "command (for example, to control an external hardware filter), edit the "
            "<font name='%s'>wss.on('message', ...)</font> handler in bridge.mjs, add a new case "
            "to the switch statement, and send the appropriate rtl_tcp command. On the client "
            "side, extend the <font name='%s'>SdrCommand</font> type in src/lib/real-sdr/types.ts "
            "and call <font name='%s'>source.configure()</font> with your new command." % (MONO_FONT, MONO_FONT, MONO_FONT)
        ),
    ]

def chapter7():
    return [
        PageBreak(),
        h1("Chapter 7: Decoders Overview"),
        body(
            "The console ships with 11 signal decoders that automatically activate when you tune "
            "to the appropriate frequency band. Each decoder runs on the IQ stream in real time, "
            "extracting structured data (text, images, aircraft positions, etc.) and displaying "
            "it in a dedicated UI panel. This chapter provides a quick-reference table of all "
            "decoders; the following chapters cover each one in detail."
        ),
        h2("Decoder Reference Table"),
        make_table(
            ["Decoder", "Frequency", "Signal Type", "Antenna", "Difficulty"],
            [
                ["RDS", "87.5-108 MHz", "FM broadcast data", "Stock whip", "Easy"],
                ["HD Radio SIS", "87.5-108 MHz", "FM broadcast (digital)", "Stock whip", "Medium"],
                ["ADS-B", "1090 MHz", "Aircraft transponder", "1090 MHz antenna", "Easy"],
                ["NOAA APT", "137.1/137.5/137.9 MHz", "Weather satellite", "V-dipole or QFH", "Medium"],
                ["Meteor M2 LRPT", "137.1/137.9 MHz", "Weather satellite (digital)", "V-dipole or QFH", "Medium"],
                ["GOES HRIT", "1685.7/1694.1 MHz", "Geostationary weather", "Helical or dish + LNA", "Hard"],
                ["POCSAG", "929-932 MHz, 138-174 MHz", "Pagers", "Stock whip or 900 MHz Yagi", "Easy"],
                ["ACARS", "131.55 MHz", "Aircraft messaging", "Stock whip", "Easy"],
                ["Inmarsat STD-C", "1537-1545 MHz", "Satellite messaging", "Helical or patch + LNA", "Hard"],
                ["GPS L1 C/A", "1575.42 MHz", "GPS positioning", "Active GPS antenna", "Medium"],
                ["Notch filter", "Any band", "Interference removal", "N/A", "Easy"],
            ],
            col_widths=[28*mm, 32*mm, 36*mm, 38*mm, 26*mm],
        ),
        h2("How Decoders Auto-Activate"),
        body(
            "Each decoder checks the current tuned frequency on every IQ block. If the frequency "
            "falls within the decoder's band of interest AND at least one UI component has "
            "subscribed to that decoder's updates, the decoder runs. This subscription-gated "
            "design means decoders only consume CPU when their results are actually being "
            "displayed - if you scroll past the ADS-B panel, the ADS-B decoder stops running to "
            "save battery and CPU."
        ),
        h2("What Each Decoder Produces"),
        body(
            "Decoders produce one of four output types:"
        ),
        h3("Text overlays"),
        body(
            "RDS and HD Radio show floating overlay cards on the spectrum panel with station "
            "name, program type, and other metadata. These update roughly once per second."
        ),
        h3("Live image displays"),
        body(
            "APT and Meteor M2 show the decoded image growing line-by-line as the satellite "
            "passes overhead. A full pass takes 10-15 minutes and produces a strip image of "
            "the Earth below the satellite's path."
        ),
        h3("Tabular data lists"),
        body(
            "ADS-B shows a list of tracked aircraft with callsign, altitude, speed, position, "
            "and a radar-style polar plot. POCSAG and ACARS show a scrolling list of decoded "
            "messages with timestamps. GPS shows a per-PRN satellite list with signal "
            "strength and tracking status."
        ),
        h3("File assembly"),
        body(
            "GOES HRIT assembles received files from CCSDS CADU frames, showing a progress bar "
            "as each file is received and a list of completed files when done. Files are "
            "categorized by type (Image, Text, JPEG-LS, EMWIN, etc.)."
        ),
        h2("Realistic Expectations"),
        body(
            "Not every decoder will produce results on every signal. Reception depends on your "
            "antenna, location, time of day, and atmospheric conditions. The ADS-B decoder will "
            "show planes whenever your antenna can see them (typically within 100-200 nm). The "
            "APT decoder only produces images during the 12-minute window when a NOAA satellite "
            "is overhead. The GPS decoder requires an active GPS antenna (with built-in LNA) - "
            "the stock RTL-SDR whip cannot pick up GPS. See each decoder's chapter for specific "
            "antenna recommendations and troubleshooting tips."
        ),
    ]

def chapter8_rds():
    return [
        PageBreak(),
        h1("Chapter 8: RDS (Radio Data System)"),
        body(
            "RDS is a 1187.5 bps digital subcarrier injected at 57 kHz on broadcast FM signals. "
            "It carries station identification, program type, radio text, and other data that "
            "you typically see on a car radio display. The console's RDS decoder runs "
            "automatically whenever you tune to a station in the FM broadcast band (87.5-108 MHz) "
            "in WFM mode, and displays the decoded data as a floating overlay card on the "
            "spectrum panel."
        ),
        h2("What RDS Carries"),
        body("The RDS protocol defines several data groups. The most common are:"),
        make_table(
            ["Code", "Name", "Description"],
            [
                ["PI", "Program Identification", "4-hex code uniquely identifying the station"],
                ["PS", "Program Service", "8-character station name (e.g. BBC R4)"],
                ["PTY", "Program Type", "0-31 code (News, Rock, Jazz, etc.)"],
                ["RT", "Radio Text", "Up to 64 chars of scrolling text (song title, etc.)"],
                ["CT", "Clock Time", "UTC time and date from the station"],
                ["TA", "Traffic Announcement", "Flag indicating traffic news is being broadcast"],
                ["TP", "Traffic Program", "Flag indicating station carries traffic info"],
                ["MS", "Music/Speech", "Flag indicating current content type"],
                ["AF", "Alternative Frequencies", "List of other frequencies carrying the same station"],
            ],
            col_widths=[14*mm, 38*mm, 118*mm],
        ),
        h2("How to Receive RDS"),
        body("RDS reception is straightforward - it works with the same antenna and settings you use for broadcast FM:"),
        body(
            "1. Switch to real-hardware mode (see Chapter 5) and connect to your dongle.<br/>"
            "2. Tune to a strong local FM station in WFM mode. The spectrum should show a clear "
            "peak with good signal-to-noise ratio.<br/>"
            "3. The RDS overlay appears automatically in the top-right corner of the spectrum "
            "panel after a few seconds. If the station carries RDS, you will see the PS name "
            "(large text), PI code, PTY, and any Radio Text the station is broadcasting."
        ),
        tip(
            "If the RDS overlay shows &quot;Waiting for RDS data&quot; for more than 10 seconds, "
            "the signal is too weak or the station does not carry RDS. Try a different station "
            "or adjust your antenna for better reception."
        ),
        h2("How the Decoder Works"),
        body(
            "The RDS decoder performs the following steps for each IQ block received:"
        ),
        body(
            "<b>1. Mix down by 57 kHz.</b> The RDS subcarrier sits at exactly 57 kHz (the third "
            "harmonic of the 19 kHz stereo pilot). We multiply the IQ stream by a 57 kHz cosine "
            "to bring the subcarrier to baseband.<br/><br/>"
            "<b>2. Bandpass filter ±2.4 kHz.</b> The RDS signal occupies a narrow band around "
            "57 kHz. A biquad bandpass filter removes everything outside this range.<br/><br/>"
            "<b>3. DBPSK demodulation.</b> RDS uses Differential Binary Phase-Shift Keying: each "
            "bit is encoded as a 180-degree phase flip (or not) relative to the previous bit. We "
            "multiply each sample by the previous sample to recover the bit stream.<br/><br/>"
            "<b>4. Bit synchronization.</b> The decoder looks for the 16-bit sync pattern "
            "(alternating 1s and 0s) at the start of each RDS group.<br/><br/>"
            "<b>5. CRC-10 validation.</b> Each 26-bit RDS block includes a 10-bit CRC (using "
            "the polynomial x^10 + x^8 + x^7 + x^5 + x^4 + x^3 + 1). Blocks with invalid CRC "
            "are discarded.<br/><br/>"
            "<b>6. Group assembly.</b> A complete RDS group consists of 4 blocks (104 bits). "
            "The decoder assembles blocks with consecutive syndrome positions (0, 1, 2, 3) into "
            "a complete group.<br/><br/>"
            "<b>7. Parameter decoding.</b> Group type 0 contains the PS name (4 groups needed to "
            "assemble all 8 characters). Group type 2 contains Radio Text (16 groups for the "
            "full 64-character message)."
        ),
        h2("Interpreting the Display"),
        body(
            "The RDS overlay shows the following fields when available:"
        ),
        h3("PS Name (large text)"),
        body(
            "The 8-character Program Service name - what you see on a car radio display. This is "
            "the most prominent field. It updates character-by-character as each group 0 is "
            "received, so the name may appear partially garbled for the first few seconds."
        ),
        h3("PI Code"),
        body(
            "The 4-hex Program Identification code uniquely identifies the station. The first "
            "character is the country code; the remaining 3 characters are the station "
            "reference. You can look up PI codes in the FCC FM database."
        ),
        h3("PTY (Program Type)"),
        body(
            "The 5-bit Program Type code (0-31). Common values: 1=News, 5=Education, 10=Pop "
            "Music, 11=Rock Music, 12=Easy Listening, 14=Other Music, 17=Weather, 23=Travel. "
            "The full table is in the IEC 62106 standard."
        ),
        h3("Radio Text"),
        body(
            "Up to 64 characters of free-form text. Typically shows the current song title and "
            "artist, or a station slogan. The text scrolls character-by-character as new "
            "groups arrive, so it may take 10-30 seconds for the full message to appear."
        ),
        h3("Group Count"),
        body(
            "The total number of valid RDS groups decoded since the decoder was reset. A "
            "healthy RDS stream produces about 10-20 groups per second. If the count is not "
            "increasing, the signal is too weak or the station is not broadcasting RDS."
        ),
        h2("Troubleshooting"),
        h3("No RDS overlay appears"),
        body(
            "Verify you are in WFM mode and tuned to a frequency in the 87.5-108 MHz band. The "
            "overlay only shows when in real-hardware mode with HW connected. Check the "
            "connection panel shows LIVE HW."
        ),
        h3("Overlay shows &quot;Waiting for RDS data&quot; indefinitely"),
        body(
            "The signal is too weak or the station does not carry RDS. Try a stronger station "
            "(look for a tall peak on the spectrum). Some community and college stations do "
            "not broadcast RDS."
        ),
        h3("PI code is correct but PS shows garbage"),
        body(
            "The PS name is sent 2 characters at a time, so it takes 4 group 0 messages to "
            "complete. If reception is marginal, you may see a mix of old and new characters. "
            "Wait a few seconds for the full message to arrive. If the problem persists, "
            "adjust your antenna for better signal."
        ),
    ]

def chapter9_hdradio():
    return [
        PageBreak(),
        h1("Chapter 9: HD Radio (NRSC-5)"),
        body(
            "HD Radio is the digital broadcasting standard used in North America for FM and AM "
            "stations. It transmits digital audio and data alongside the analog signal, providing "
            "CD-quality audio, multiple subchannels, and text data. The console's HD Radio decoder "
            "focuses on the SIS (Station Information Service) sub-channel, which carries station "
            "identification, call letters, and time synchronization."
        ),
        h2("Why SIS Only?"),
        body(
            "Full HD Radio audio decoding would require implementing the HDC (High-Definition "
            "Coding) audio codec, which is proprietary and has no open-source decoder. Even "
            "the open-source nrsc5 project, which decodes HD Radio, had to reverse-engineer "
            "parts of the codec. Instead, we decode the SIS sub-channel, which uses standard "
            "BPSK modulation and provides useful station information without the audio codec "
            "headache. You hear the analog FM audio; the SIS overlay shows the digital station "
            "ID."
        ),
        h2("HD Radio Signal Structure"),
        body(
            "An HD Radio FM signal consists of the analog FM carrier plus several digital "
            "sidebands:"
        ),
        make_table(
            ["Subband", "Offset", "Bandwidth", "Content"],
            [
                ["P1", "±10.7 kHz", "±8.0 kHz", "Primary audio (main program)"],
                ["P2", "±10.7 kHz", "±8.0 kHz", "Secondary audio (subchannel)"],
                ["PIDS", "±29.0 kHz", "±5.0 kHz", "Station Information Service (SIS)"],
                ["P3", "±20.4 kHz", "±4.0 kHz", "Additional subchannels"],
            ],
            col_widths=[18*mm, 28*mm, 28*mm, 96*mm],
        ),
        body(
            "All sidebands fit within the standard 200 kHz FM channel allocation. Your RTL-SDR's "
            "WFM filter (180 kHz bandwidth) captures all of them. The SIS decoder focuses on "
            "the PIDS subband at ±29 kHz."
        ),
        h2("What SIS Provides"),
        body("The SIS decoder extracts the following data from the PIDS sub-channel:"),
        make_table(
            ["Field", "Description", "Example"],
            [
                ["Country", "3-bit country code (US, CA, MX, etc.)", "US"],
                ["Facility ID", "19-bit FCC facility identifier", "12345"],
                ["Call Letters", "4-character station call sign", "WNYC"],
                ["Slogan", "Up to 56 chars of station name", "WNYC-FM New York"],
                ["ALFN", "Absolute Frame Number (GPS-locked time)", "2024-01-15 12:34:56"],
                ["Audio Service", "Service descriptor (MP1, MP2, MP3)", "MP1"],
            ],
            col_widths=[28*mm, 80*mm, 62*mm],
        ),
        h2("How to Receive HD Radio"),
        body("HD Radio reception uses the same antenna and setup as standard FM broadcast:"),
        body(
            "1. Connect your RTL-SDR V3 and switch to real-hardware mode.<br/>"
            "2. Tune to a strong local FM station in WFM mode. In the US, most stations "
            "broadcast HD Radio alongside their analog signal.<br/>"
            "3. The HD Radio overlay appears automatically in the top-left corner of the "
            "spectrum panel (alongside the RDS overlay in the top-right). After a few seconds, "
            "you should see the call letters and ALFN time stamp appear.<br/>"
            "4. Click AUDIO ON to hear the analog FM audio (digital audio decoding is not "
            "supported)."
        ),
        tip(
            "HD Radio is primarily a North American standard. In Europe, the equivalent is "
            "DAB/DAB+, which uses different frequencies (174-240 MHz) and a different protocol. "
            "This decoder does not handle DAB."
        ),
        h2("How the Decoder Works"),
        body("The SIS decoder performs the following steps:"),
        body(
            "<b>1. Mix down by 29 kHz.</b> The PIDS subband sits at ±29 kHz from the center "
            "frequency. We multiply the IQ stream by a 29 kHz cosine to bring the PIDS to "
            "baseband.<br/><br/>"
            "<b>2. Bandpass filter ±5 kHz.</b> The PIDS bandwidth is ±5 kHz. A biquad low-pass "
            "removes everything outside this range.<br/><br/>"
            "<b>3. DBPSK demodulation at 352.7 bps.</b> SIS uses differential BPSK at 352.7 "
            "bits per second (1 bit per OFDM symbol, 1 ms per symbol).<br/><br/>"
            "<b>4. Sync word detection.</b> The SIS frame begins with a 32-bit sync word "
            "(0x7C95E5E8). The decoder searches for this pattern (and its bit-inverse, to "
            "handle the differential decoding ambiguity).<br/><br/>"
            "<b>5. CRC-16 validation.</b> Each SIS frame includes a 16-bit CRC (CCITT polynomial "
            "0x1021). Frames with invalid CRC are discarded.<br/><br/>"
            "<b>6. Message parsing.</b> The 96-bit SIS payload contains one of four message "
            "types: SIS params (country + facility ID), station ID (call letters), station name "
            "(slogan), or ALFN + audio service descriptor."
        ),
        h2("What to Expect"),
        body(
            "RDS and HD Radio SIS provide similar information, but HD Radio SIS is more "
            "comprehensive. If both decoders are active, you will see both overlays on the "
            "spectrum panel. The HD Radio overlay is typically more reliable than RDS (HD "
            "Radio has stronger FEC) and provides additional data like the ALFN time stamp "
            "and facility ID that RDS does not carry."
        ),
        warning(
            "Some stations broadcast HD Radio but do not populate all SIS fields. You may see "
            "the call letters but no slogan, or vice versa. This is normal - the station simply "
            "isn't broadcasting that particular data."
        ),
    ]

def chapter10_adsb():
    return [
        PageBreak(),
        h1("Chapter 10: ADS-B Aircraft Tracking"),
        body(
            "ADS-B (Automatic Dependent Surveillance-Broadcast) is the system by which aircraft "
            "broadcast their position, altitude, velocity, and identification twice per second "
            "on 1090 MHz. The console decodes these Mode S Extended Squitter messages and "
            "displays the aircraft on a radar-style polar plot, with a list showing callsign, "
            "altitude, speed, and position. This is one of the most rewarding decoders to use "
            "because aircraft are almost always within range."
        ),
        h2("ADS-B Signal Structure"),
        body(
            "Aircraft broadcast ADS-B on 1090 MHz using 1 Mbps PPM (Pulse Position Modulation) "
            "with the following frame structure:"
        ),
        make_table(
            ["Field", "Bits", "Description"],
            [
                ["Preamble", "8", "Synchronization pattern (2 pulses, 1 us apart)"],
                ["DF (Downlink Format)", "5", "17=ADS-B, 18=Non-transponder, 11=Short"],
                ["CA (Capability)", "3", "Aircraft capability flags"],
                ["ICAO Address", "24", "Unique 24-bit aircraft address"],
                ["ME (Message)", "56", "Type-specific data (position, velocity, etc.)"],
                ["PI (Parity/Interrogator)", "24", "Error correction + interrogator ID"],
            ],
            col_widths=[36*mm, 18*mm, 116*mm],
        ),
        body(
            "The ME field contains different data depending on the 5-bit type code at its "
            "start: type codes 1-4 carry the aircraft callsign (8 characters), type codes "
            "9-18 carry airborne position (using Compact Position Reporting - CPR), and type "
            "code 19 carries airborne velocity. CPR is a clever scheme that encodes global "
            "latitude and longitude in just 35 bits each by alternating between two encodings "
            "(odd and even) that must be received in pairs."
        ),
        h2("How to Receive ADS-B"),
        body("ADS-B reception requires:"),
        body(
            "1. A real RTL-SDR V3 connected (see Chapter 5).<br/>"
            "2. Tune to 1090 MHz. The demodulator mode does not matter (RAW is recommended - "
            "the ADS-B decoder works on raw IQ samples, not demodulated audio).<br/>"
            "3. The ADS-B panel appears automatically in the center column below the signal "
            "meter. If you don't see it, verify you are tuned to 1090 MHz ± 10 MHz.<br/>"
            "4. Set sample rate to 2.4 Msps (default) for best results. The 1 Mbps signal needs "
            "at least 2 Msps to capture cleanly.<br/>"
            "5. Set gain to 30-40 dB (manual, AGC off) or use AGC. Higher gain can help with "
            "weak signals from distant aircraft."
        ),
        h3("Antenna Recommendations"),
        body(
            "The stock RTL-SDR whip antenna works for ADS-B if you are within 50-100 nm of an "
            "airport or major flight path. For better range, a dedicated 1090 MHz antenna is "
            "recommended. Options include:"
        ),
        make_table(
            ["Antenna Type", "Range", "Cost", "Notes"],
            [
                ["Stock whip (vertical)", "50-100 nm", "Included", "OK for beginners"],
                ["1/4 wave ground plane", "100-150 nm", "$10-15 DIY", "Easy to build"],
                ["Collinear (8-element)", "150-250 nm", "$25-40", "Best DIY option"],
                ["Commercial 1090 MHz antenna", "200-300 nm", "$30-60", "FlightAware Pro Stick Plus"],
                ["Pre-amplified antenna", "250+ nm", "$50-100", "Includes LNA for weak signals"],
            ],
            col_widths=[42*mm, 28*mm, 28*mm, 72*mm],
        ),
        tip(
            "Place your antenna near a window with a clear view of the sky. ADS-B signals are "
            "line-of-sight, so obstructions (buildings, trees, terrain) limit range. The "
            "aircraft must be above your local horizon to be received."
        ),
        h2("Interpreting the Radar Plot"),
        body(
            "The ADS-B panel includes a polar radar plot showing all tracked aircraft relative "
            "to your receiver. The receiver is at the center (cyan dot). Range rings are drawn "
            "at 50, 100, 150, and 200 nautical miles. Aircraft appear as small triangles "
            "oriented in the direction of travel, labeled with their callsign. A slow rotating "
            "sweep beam adds a traditional radar aesthetic."
        ),
        body(
            "The center of the plot is computed as the centroid of all decoded positions, which "
            "approximates your receiver's location (since ADS-B range is typically 100-200 nm, "
            "the centroid is close to the receiver). Aircraft appear when their position is "
            "decoded and disappear after 60 seconds without a new message."
        ),
        h2("Aircraft List"),
        body(
            "Below the radar plot, the aircraft list shows each tracked aircraft with:"
        ),
        make_table(
            ["Field", "Description", "Example"],
            [
                ["ICAO", "24-bit hex aircraft address", "A1B2C3"],
                ["Callsign", "Flight identifier (from type 1-4)", "UAL123"],
                ["Altitude", "Barometric altitude in feet", "37000 ft"],
                ["Position", "Latitude, longitude (from CPR)", "40.7128, -74.0060"],
                ["Speed", "Ground speed in knots", "450 kt"],
                ["Track", "Heading in degrees (0-359)", "270"],
                ["Vertical Rate", "Climb/descent in ft/min", "+500 (climbing)"],
            ],
            col_widths=[28*mm, 70*mm, 72*mm],
        ),
        body(
            "The list is sorted by most recent message received. Aircraft that have not been "
            "heard from in 60 seconds are removed automatically. Click any aircraft in the "
            "list to highlight it on the radar plot."
        ),
        h2("Verifying with Flightradar24"),
        body(
            "To verify your ADS-B decoding, compare the aircraft you see with the live map at "
            "flightradar24.com. The callsigns, altitudes, and positions should match. "
            "Discrepancies usually indicate a weak signal causing position decode errors, or "
            "the occasional false positive from the preamble detector (these are filtered out "
            "by the 60-second timeout)."
        ),
        h2("Performance Notes"),
        body(
            "The ADS-B decoder processes about 100-500 messages per second from a typical "
            "antenna in a busy area. Each message is 120 microseconds long, so the duty cycle "
            "is low. The decoder uses a sliding-window preamble detector that runs in real "
            "time on a modern CPU. If you see high CPU usage, try lowering the sample rate to "
            "1.024 Msps - this reduces the workload without significantly affecting ADS-B "
            "decode quality (1 Mbps still fits within 1.024 MHz of bandwidth)."
        ),
    ]
