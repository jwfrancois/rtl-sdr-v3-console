#!/usr/bin/env node
/**
 * RTL-SDR → WebSocket bridge.
 *
 * Connects to `rtl_tcp` running on your PC and exposes the IQ stream +
 * control over WebSocket so the browser app can talk to your real
 * hardware. See README.md in this folder for setup instructions.
 *
 * Usage:
 *   node bridge.mjs                       # uses defaults (rtl_tcp on localhost:1234, WS on 8080)
 *   node bridge.mjs --rtl-host 192.168.1.10 --rtl-port 1234 --ws-port 8080
 *
 * Protocol:
 *   Client → Server: JSON control messages
 *       { "type": "set_frequency", "hz": 91500000 }
 *       { "type": "set_sample_rate", "hz": 2400000 }
 *       { "type": "set_gain", "db": 30 }          // or "auto"
 *       { "type": "set_ppm", "ppm": 0 }
 *       { "type": "start" } / { "type": "stop" }
 *       { "type": "status" }
 *
 *   Server → Client: JSON status messages + binary IQ blocks
 *       { "type": "status", "payload": { ... } }
 *       Binary frame layout (little-endian):
 *         uint32  sampleRate
 *         uint32  frequencyLo (low 32 bits of Hz)
 *         uint32  frequencyHi (high 32 bits)
 *         uint32  timestampMs (truncated)
 *         rest    IQ bytes (interleaved unsigned 8-bit I/Q)
 *
 *   rtl_tcp protocol reference: https://osmocom.org/projects/rtl-sdr/wiki
 */

import net from "node:net";
import { WebSocketServer } from "ws";

// --- Parse args ---
const args = parseArgs(process.argv.slice(2));
const RTL_HOST = args["rtl-host"] ?? "127.0.0.1";
const RTL_PORT = Number(args["rtl-port"] ?? 1234);
const WS_HOST = args["ws-host"] ?? "0.0.0.0";
const WS_PORT = Number(args["ws-port"] ?? 8080);

// rtl_tcp command bytes
const RTL_TCP_SET_FREQ = 1;
const RTL_TCP_SET_SAMPLE_RATE = 2;
const RTL_TCP_SET_GAIN_MODE = 3;
const RTL_TCP_SET_GAIN = 4;
const RTL_TCP_SET_FREQ_CORRECTION = 5;

let rtlSocket = null;
let rtlConnected = false;
let handshakeDone = false;
let streaming = false;
let clients = new Set();
let currentFreq = 0;
let currentSampleRate = 0;
let currentGainDb = "auto";
let currentPpm = 0;
let startTime = 0;
let overruns = 0;
let deviceName = "RTL-SDR";

// Reconnect loop to rtl_tcp
function connectRtl() {
  console.log(`[bridge] connecting to rtl_tcp at ${RTL_HOST}:${RTL_PORT}…`);
  const sock = net.createConnection({ host: RTL_HOST, port: RTL_PORT }, () => {
    rtlConnected = true;
    handshakeDone = false;
    console.log("[bridge] connected to rtl_tcp");
    startTime = Date.now();
  });
  sock.on("data", (chunk) => {
    if (!handshakeDone) {
      // rtl_tcp sends a 12-byte handshake on connect: "RTL0" + 4-byte
      // tuner_id (BE, htonl) + 4-byte tuner_gain_count (BE)
      if (chunk.length < 12) {
        return; // wait for more
      }
      const magic = chunk.slice(0, 4).toString("ascii");
      if (magic.startsWith("RTL0")) {
        // rtl_tcp uses BIG-ENDIAN for the tuner_id and gain_count fields
        // (see rtl_tcp.c — it wraps them with htonl). Reading as LE produces
        // huge numbers like 83886080 (0x05000000) which is actually 5 (R820T).
        const tunerId = chunk.readUInt32BE(4);
        deviceName = inferTunerName(tunerId);
        console.log(`[bridge] rtl_tcp handshake OK (tuner: ${deviceName})`);
      } else {
        console.warn(`[bridge] unexpected rtl_tcp magic: ${JSON.stringify(magic)}`);
      }
      handshakeDone = true;
      const rest = chunk.slice(12);
      if (rest.length > 0) onIqData(rest);
      return;
    }
    onIqData(chunk);
  });
  sock.on("error", (err) => {
    console.error("[bridge] rtl_tcp socket error:", err.message);
    rtlConnected = false;
    setTimeout(connectRtl, 2000);
  });
  sock.on("close", () => {
    rtlConnected = false;
    handshakeDone = false;
    console.log("[bridge] rtl_tcp connection closed, reconnecting…");
    setTimeout(connectRtl, 2000);
  });
  rtlSocket = sock;
}

function inferTunerName(id) {
  switch (id) {
    case 1: return "RTL-SDR V3 (R820T2)";
    case 2: return "FC0012";
    case 3: return "FC0013";
    case 4: return "FC2580";
    case 5: return "R820T";
    case 6: return "R828D";
    case 7: return "E4000";
    default: return `RTL-SDR (tuner ${id})`;
  }
}

// Buffer IQ data + ship to clients at ~10 Hz to avoid spamming small frames
let iqBuffer = Buffer.alloc(0);
const CHUNK_SIZE = 32768; // 32 KB ≈ 16K complex samples
const FLUSH_INTERVAL_MS = 50;
setInterval(() => {
  if (iqBuffer.length === 0 || clients.size === 0) return;
  while (iqBuffer.length >= CHUNK_SIZE) {
    const chunk = iqBuffer.subarray(0, CHUNK_SIZE);
    iqBuffer = iqBuffer.subarray(CHUNK_SIZE);
    shipIqFrame(chunk);
  }
}, FLUSH_INTERVAL_MS);

function onIqData(buf) {
  if (!streaming) return;
  if (clients.size === 0) return;
  // Back-pressure: drop new data if buffer is huge
  if (iqBuffer.length > 4 * 1024 * 1024) {
    overruns++;
    return;
  }
  iqBuffer = Buffer.concat([iqBuffer, buf]);
}

function shipIqFrame(iqBytes) {
  const header = Buffer.alloc(16);
  header.writeUInt32LE(currentSampleRate, 0);
  header.writeUInt32LE(currentFreq >>> 0, 4);
  header.writeUInt32LE(Math.floor(currentFreq / 0x100000000) >>> 0, 8);
  header.writeUInt32LE((Date.now() & 0xffffffff) >>> 0, 12);
  const frame = Buffer.concat([header, iqBytes]);
  for (const ws of clients) {
    try {
      ws.send(frame);
    } catch {}
  }
}

function broadcastStatus() {
  const status = {
    type: "status",
    payload: {
      connected: rtlConnected,
      deviceName,
      frequency: currentFreq,
      sampleRate: currentSampleRate,
      gainDb: currentGainDb,
      ppm: currentPpm,
      gains: [],
      overruns,
      uptime: rtlConnected ? (Date.now() - startTime) / 1000 : 0,
    },
  };
  const msg = JSON.stringify(status);
  for (const ws of clients) {
    try {
      ws.send(msg);
    } catch {}
  }
}
setInterval(broadcastStatus, 1000);

function sendRtlCommand(cmd, value) {
  if (!rtlSocket || !rtlConnected || !handshakeDone) return;
  // rtl_tcp commands: 1-byte command + 4-byte big-endian value
  const buf = Buffer.alloc(5);
  buf.writeUInt8(cmd, 0);
  buf.writeUInt32BE(value >>> 0, 1);
  rtlSocket.write(buf);
}

// --- WebSocket server ---
const wss = new WebSocketServer({ host: WS_HOST, port: WS_PORT });
console.log(`[bridge] WebSocket server listening on ws://${WS_HOST}:${WS_PORT}`);

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[bridge] client connected (${clients.size} total)`);

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    switch (msg.type) {
      case "set_frequency":
        currentFreq = Math.max(0, Math.floor(msg.hz));
        sendRtlCommand(RTL_TCP_SET_FREQ, currentFreq);
        console.log(`[bridge] freq → ${(currentFreq / 1e6).toFixed(4)} MHz`);
        break;
      case "set_sample_rate":
        currentSampleRate = Math.max(0, Math.floor(msg.hz));
        sendRtlCommand(RTL_TCP_SET_SAMPLE_RATE, currentSampleRate);
        console.log(`[bridge] sample rate → ${(currentSampleRate / 1e6).toFixed(3)} Msps`);
        break;
      case "set_gain":
        if (msg.db === "auto") {
          currentGainDb = "auto";
          sendRtlCommand(RTL_TCP_SET_GAIN_MODE, 1); // auto
        } else {
          currentGainDb = Number(msg.db);
          sendRtlCommand(RTL_TCP_SET_GAIN_MODE, 0); // manual
          sendRtlCommand(RTL_TCP_SET_GAIN, Math.floor(currentGainDb * 10));
        }
        break;
      case "set_ppm":
        currentPpm = Number(msg.ppm) | 0;
        sendRtlCommand(RTL_TCP_SET_FREQ_CORRECTION, currentPpm);
        break;
      case "start":
        streaming = true;
        console.log("[bridge] streaming started");
        break;
      case "stop":
        streaming = false;
        console.log("[bridge] streaming stopped");
        break;
      case "status":
        broadcastStatus();
        break;
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[bridge] client disconnected (${clients.size} total)`);
  });

  ws.on("error", () => {
    clients.delete(ws);
  });

  broadcastStatus();
});

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}

// Kick things off
connectRtl();

process.on("SIGINT", () => {
  console.log("\n[bridge] shutting down…");
  if (rtlSocket) rtlSocket.destroy();
  process.exit(0);
});
