# RTL-SDR WebSocket Bridge

A tiny Node.js script that connects to a local `rtl_tcp` instance on your PC
and exposes the IQ stream + control over WebSocket, so the browser app can
talk to your real RTL-SDR V3 hardware.

## Quick start

### 1. Install `rtl_tcp`

The `rtl_tcp` daemon ships with the standard RTL-SDR package on every
platform.

**macOS (Homebrew):**
```bash
brew install librtlsdr
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt install rtl-sdr
```

**Windows:** Download the prebuilt binaries from
[osmocom.org](https://osmocom.org/projects/rtl-sdr/wiki) or use the
[SDR# `rtl_tcp` build](https://www.rtl-sdr.com/).

Add a udev rule so non-root users can access the dongle (Linux only):
```bash
echo 'SUBSYSTEMS=="usb", ATTRS{idVendor}=="0bda", ATTRS{idProduct}=="2838", MODE:="0666"' | sudo tee /etc/udev/rules.d/20.rtlsdr.rules
sudo udevadm control --reload-rules
sudo udevadm trigger
```

### 2. Start `rtl_tcp`

Plug in your RTL-SDR V3, then in one terminal:

```bash
rtl_tcp -s 2400000   # 2.4 Msps default; you can change this from the app later
```

You should see something like:
```
Found 1 device(s):
  0:  Realtek, RTL2838UHIDIR, SN: 00000001
Using device 0: Generic RTL2832U OEM
Listening on TCP port 1234...
```

### 3. Run this bridge

In another terminal, from this `sdr-bridge/` folder:

```bash
# One-time setup
npm install

# Start the bridge
npm start
# → ws://0.0.0.0:8080
```

Or pass custom options:
```bash
node bridge.mjs --rtl-host 127.0.0.1 --rtl-port 1234 --ws-port 8080
```

### 4. Connect from the web app

In the RTL-SDR V3 web console (top-left panel):

1. Click **"Real RTL-SDR"** in the *Hardware Source* panel.
2. The default bridge URL `ws://localhost:8080` should work if you're
   running both the browser and the bridge on the same PC.
3. If the browser is on a different device (e.g. the cloud preview on
   your phone, bridge on your laptop), enter your laptop's LAN IP, e.g.
   `ws://192.168.1.50:8080`.
4. The status indicator should flip to **LIVE HW** within a second.

Click **AUDIO ON** to hear the demodulated signal. Tune with the
frequency tuner, switch demodulator modes, adjust gain — every control
is forwarded to the hardware.

## Protocol

The bridge speaks a small JSON + binary protocol over WebSocket.

### Client → Server (JSON text frames)

| Message                                              | Effect                              |
| ---------------------------------------------------- | ----------------------------------- |
| `{"type":"set_frequency","hz":91500000}`             | Tune the SDR                        |
| `{"type":"set_sample_rate","hz":2400000}`            | Change sample rate                  |
| `{"type":"set_gain","db":30}` or `{"db":"auto"}`     | Manual gain in dB, or auto AGC      |
| `{"type":"set_ppm","ppm":0}`                         | Frequency correction in PPM         |
| `{"type":"start"}` / `{"type":"stop"}`               | Start / stop IQ streaming           |
| `{"type":"status"}`                                  | Request a status snapshot           |

### Server → Client

- **JSON text frames** with `type: "status"` and the current device
  state — emitted every 1 s.
- **Binary frames** with the IQ data, laid out as (little-endian):

  | Offset | Type     | Field                          |
  | ------ | -------- | ------------------------------ |
  | 0      | uint32 LE | `sampleRate`                  |
  | 4      | uint32 LE | `frequencyLo` (low 32 bits)   |
  | 8      | uint32 LE | `frequencyHi` (high 32 bits)  |
  | 12     | uint32 LE | `timestampMs` (truncated)     |
  | 16…    | bytes     | Interleaved unsigned 8-bit I/Q |

## Troubleshooting

**"Bridge not reachable"** — Make sure `rtl_tcp` is running and the
bridge script shows `WebSocket server listening on ws://0.0.0.0:8080`.
Check your firewall allows port 8080 from the browser's host.

**"rtl_tcp connection closed"** — The dongle may have been unplugged, or
another SDR app is holding it. Close SDR#, GQRX, etc., then restart
`rtl_tcp`.

**Audio sounds clipped / choppy** — Drop the sample rate to 1.024 or
0.24 Msps. The browser's WebSocket throughput tops out around 2–3 MB/s
on a clean LAN.

**Browsers block `ws://` from `https://` pages** — Modern Chrome allows
`ws://localhost` and `ws://127.0.0.1` from HTTPS pages. For other hosts
you may need to expose the bridge over `wss://` (e.g. via `ngrok http
8080`, or run the app locally on `http://localhost:3000`).

## Files

- `bridge.mjs` — The bridge script (single file, no build step).
- `package.json` — Declares the `ws` dependency.
