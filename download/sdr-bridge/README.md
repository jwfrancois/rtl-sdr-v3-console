# RTL-SDR WebSocket Bridge

A tiny Node.js script that connects to a local `rtl_tcp` instance on your PC
and exposes the IQ stream + control over WebSocket, so the browser app can
talk to your real RTL-SDR V3 hardware.

## Portable / remote access (use the dongle from anywhere)

By default the bridge speaks plain `ws://` (insecure WebSocket). Browsers
allow `ws://localhost:8080` from any page, but if you want to access the
dongle from a different device (e.g. your phone, another PC, or the cloud
preview), you need `wss://` (TLS).

### Option A: self-signed cert (recommended for LAN access)

```bash
# Start the bridge with --tls; it auto-generates a cert into ./certs/
node bridge.mjs --tls
# → wss://0.0.0.0:8443
```

Your browser will warn about the self-signed cert the first time. Visit
`https://<your-pc-ip>:8443/` once in your browser and click "Advanced →
Proceed" to trust it. After that, the WebSocket URL
`wss://<your-pc-ip>:8443` works from any device on your LAN.

### Option B: use your own cert (Let's Encrypt / corporate)

```bash
node bridge.mjs --tls --cert /path/fullchain.pem --key /path/privkey.pem
```

### Option C: ngrok tunnel (works from anywhere, no cert setup)

```bash
# In one terminal — your bridge
node bridge.mjs

# In another — expose it via ngrok
ngrok http 8080
# → https://abcd-1234.ngrok-free.app
```

Then in the web app, set the bridge URL to `wss://abcd-1234.ngrok-free.app`
(replacing with your actual ngrok URL). This works from anywhere — phone,
laptop, anywhere in the world — and tunnels through your firewall.

### Downloading recordings remotely

The bridge also runs an HTTP server on `port + 1` (default `8081`) that
serves recorded IQ files. The web app auto-discovers this URL when you
switch to real mode — just click any recording in the **IQ Recording**
panel to download it.

For remote access via ngrok, expose port 8081 too:
```bash
ngrok http 8081
```

The app's recording panel will then need both URLs — for now, download
recordings from the same `ws` host by visiting
`http://<your-pc-ip>:8081/recordings` directly in your browser.

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
# Write rules covering the RTL-SDR V3 + V4 + common clones
sudo tee /etc/udev/rules.d/20.rtlsdr.rules > /dev/null <<'EOF'
# RTL-SDR V3 / V4 (Realtek RTL2832U / RTL2838UHIDIR)
SUBSYSTEMS=="usb", ATTRS{idVendor}=="0bda", ATTRS{idProduct}=="2838", MODE:="0666", GROUP="plugdev"
SUBSYSTEMS=="usb", ATTRS{idVendor}=="0bda", ATTRS{idProduct}=="2832", MODE:="0666", GROUP="plugdev"
# RTL-SDR.com Blog V3 / V4 (default VID:PID)
SUBSYSTEMS=="usb", ATTRS{idVendor}=="1d50", ATTRS{idProduct}=="6089", MODE:="0666", GROUP="plugdev"
EOF

sudo udevadm control --reload-rules
sudo udevadm trigger

# Make sure your user is in the plugdev group, then LOG OUT and back in
sudo usermod -aG plugdev $USER

# Unplug and replug the dongle (or force a re-add)
sudo udevadm trigger --action=add --subsystem-match=usb
```

If you see `usb_open error -3` when running `rtl_tcp`, that means the rules
haven't taken effect yet. The two most common causes are (1) you haven't
logged out/in after `usermod -aG plugdev`, or (2) the dongle was plugged
in before the rules were loaded — unplug and replug it. As a last-resort
fallback you can run `sudo rtl_tcp -s 2400000` (the bridge itself doesn't
need root, only `rtl_tcp` does).

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

**`usb_open error -3` / `Failed to open rtlsdr device #0`** — Linux USB
permission error. Your user can't access the raw device. Fix:

```bash
# 1. Write udev rules (one-time)
sudo tee /etc/udev/rules.d/20.rtlsdr.rules > /dev/null <<'EOF'
SUBSYSTEMS=="usb", ATTRS{idVendor}=="0bda", ATTRS{idProduct}=="2838", MODE:="0666", GROUP="plugdev"
SUBSYSTEMS=="usb", ATTRS{idVendor}=="0bda", ATTRS{idProduct}=="2832", MODE:="0666", GROUP="plugdev"
SUBSYSTEMS=="usb", ATTRS{idVendor}=="1d50", ATTRS{idProduct}=="6089", MODE:="0666", GROUP="plugdev"
EOF

# 2. Reload + add yourself to plugdev
sudo udevadm control --reload-rules
sudo udevadm trigger
sudo usermod -aG plugdev $USER

# 3. LOG OUT and log back in (or reboot) so the group change takes effect

# 4. Unplug and replug the dongle
```

Quick fallback that works without any of the above:
```bash
sudo rtl_tcp -s 2400000
```
(The bridge itself doesn't need root — only `rtl_tcp` does.)

**Garbled device name in `rtl_tcp` output** (`Found 1 device(s): 0: , PÆ, SN: `)
— Normal. Your dongle's EEPROM doesn't have a friendly name programmed.
The device still works fine.

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
