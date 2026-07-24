#!/usr/bin/env node
/**
 * RTL-SDR → WebSocket bridge.
 *
 * Connects to `rtl_tcp` running on your PC and exposes the IQ stream +
 * control over WebSocket so the browser app can talk to your real
 * hardware. See README.md in this folder for setup instructions.
 *
 * Usage:
 *   node bridge.mjs                                  # ws://0.0.0.0:8080
 *   node bridge.mjs --tls                            # wss://0.0.0.0:8443 (self-signed)
 *   node bridge.mjs --tls --cert /path/cert.pem --key /path/key.pem
 *   node bridge.mjs --rtl-host 192.168.1.10 --rtl-port 1234 --ws-port 8080
 *
 * When --tls is set without --cert/--key, a self-signed cert is generated
 * into ./certs/ on first run. The browser will warn about it once.
 *
 * Protocol:
 *   Client → Server: JSON control messages
 *     { "type": "set_frequency", "hz": 91500000 }
 *     { "type": "set_sample_rate", "hz": 2400000 }
 *     { "type": "set_gain", "db": 30 }   // or "auto"
 *     { "type": "set_ppm", "ppm": 0 }
 *     { "type": "start" } / { "type": "stop" }
 *     { "type": "status" }
 *
 *   Server → Client: JSON status + binary IQ blocks (16-byte header + IQ bytes)
 *
 *   rtl_tcp protocol reference: https://osmocom.org/projects/rtl-sdr/wiki
 */

import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { WebSocketServer } from "ws";

// --- Parse args ---
const args = parseArgs(process.argv.slice(2));
const RTL_HOST = args["rtl-host"] ?? "127.0.0.1";
const RTL_PORT = Number(args["rtl-port"] ?? 1234);
const WS_HOST = args["ws-host"] ?? "0.0.0.0";
const WS_PORT = Number(args["ws-port"] ?? 8080);
const USE_TLS = args["tls"] !== undefined;
const CERT_PATH = args["cert"];
const KEY_PATH = args["key"];
const CERTS_DIR = path.join(process.cwd(), "certs");

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

// IQ recording state (server-side)
let recording = false;
let recordingPath = "";
let recordingBytes = 0;
let recordingStartTime = 0;
let recordingStream = null;

function connectRtl() {
  console.log(`[bridge] connecting to rtl_tcp at ${RTL_HOST}:${RTL_PORT}…`);
  const sock = net.createConnection({ host: RTL_HOST, port: RTL_PORT }, () => {
    rtlConnected = true;
    handshakeDone = false;
    startTime = Date.now();
    console.log("[bridge] connected to rtl_tcp");
  });
  sock.on("data", (chunk) => {
    if (!handshakeDone) {
      if (chunk.length < 12) return;
      const magic = chunk.slice(0, 4).toString("ascii");
      if (magic.startsWith("RTL0")) {
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

let iqBuffer = Buffer.alloc(0);
const CHUNK_SIZE = 32768;
setInterval(() => {
  if (iqBuffer.length === 0 || clients.size === 0) return;
  while (iqBuffer.length >= CHUNK_SIZE) {
    const chunk = iqBuffer.subarray(0, CHUNK_SIZE);
    iqBuffer = iqBuffer.subarray(CHUNK_SIZE);
    shipIqFrame(chunk);
  }
}, 50);

function onIqData(buf) {
  if (!streaming || clients.size === 0) return;
  // Recording (server-side) — write raw IQ bytes
  if (recording && recordingStream) {
    try {
      recordingStream.write(buf);
      recordingBytes += buf.length;
    } catch (err) {
      console.error("[bridge] recording write error:", err.message);
    }
  }
  if (iqBuffer.length > 4 * 1024 * 1024) { overruns++; return; }
  iqBuffer = Buffer.concat([iqBuffer, buf]);
}

function shipIqFrame(iqBytes) {
  const header = Buffer.alloc(16);
  header.writeUInt32LE(currentSampleRate, 0);
  header.writeUInt32LE(currentFreq >>> 0, 4);
  header.writeUInt32LE(Math.floor(currentFreq / 0x100000000) >>> 0, 8);
  header.writeUInt32LE((Date.now() & 0xffffffff) >>> 0, 12);
  const frame = Buffer.concat([header, iqBytes]);
  for (const ws of clients) { try { ws.send(frame); } catch {} }
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
      recording: recording && {
        path: recordingPath,
        bytes: recordingBytes,
        duration: (Date.now() - recordingStartTime) / 1000,
        sampleRate: currentSampleRate,
        frequency: currentFreq,
      },
    },
  };
  const msg = JSON.stringify(status);
  for (const ws of clients) { try { ws.send(msg); } catch {} }
}
setInterval(broadcastStatus, 500);

function sendRtlCommand(cmd, value) {
  if (!rtlSocket || !rtlConnected || !handshakeDone) return;
  const buf = Buffer.alloc(5);
  buf.writeUInt8(cmd, 0);
  buf.writeUInt32BE(value >>> 0, 1);
  rtlSocket.write(buf);
}

// --- Recording control ---
function startRecording(name) {
  if (recording) stopRecording();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fname = name || `iq-${stamp}-${(currentFreq / 1e6).toFixed(4)}MHz-${(currentSampleRate / 1e3).toFixed(0)}ksps.raw`;
  recordingPath = path.join(process.cwd(), "recordings", fname);
  fs.mkdirSync(path.dirname(recordingPath), { recursive: true });
  recordingStream = fs.createWriteStream(recordingPath);
  recording = true;
  recordingBytes = 0;
  recordingStartTime = Date.now();
  console.log(`[bridge] recording started → ${recordingPath}`);
}
function stopRecording() {
  if (!recording) return null;
  const result = {
    path: recordingPath,
    bytes: recordingBytes,
    duration: (Date.now() - recordingStartTime) / 1000,
    sampleRate: currentSampleRate,
    frequency: currentFreq,
  };
  try { recordingStream?.end(); } catch {}
  recording = false;
  recordingStream = null;
  console.log(`[bridge] recording stopped (${(result.bytes / 1e6).toFixed(1)} MB, ${result.duration.toFixed(1)} s)`);
  return result;
}

// --- HTTP server for file downloads (recordings) ---
import http from "node:http";
const HTTP_PORT = Number(args["http-port"] ?? 8081);
const httpServer = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/recordings") {
    const dir = path.join(process.cwd(), "recordings");
    try {
      const files = fs.readdirSync(dir).map((name) => {
        const stat = fs.statSync(path.join(dir, name));
        return { name, size: stat.size, mtime: stat.mtime };
      }).sort((a, b) => b.mtime - a.mtime);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(files));
      return;
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
  }
  if (url.pathname.startsWith("/recordings/")) {
    const fname = decodeURIComponent(url.pathname.slice("/recordings/".length));
    // Strict basename check — no path traversal
    if (fname.includes("/") || fname.includes("..")) {
      res.statusCode = 400;
      res.end("Bad filename");
      return;
    }
    const fp = path.join(process.cwd(), "recordings", path.basename(fname));
    if (!fs.existsSync(fp)) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    const stat = fs.statSync(fp);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(fp)}"`);
    fs.createReadStream(fp).pipe(res);
    return;
  }
  if (url.pathname === "/" || url.pathname === "/health") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, ws: USE_TLS ? "wss" : "ws", port: WS_PORT }));
    return;
  }
  // Preset sync — bookmarks + scan presets stored as JSON
  if (url.pathname === "/presets") {
    const presetFile = path.join(process.cwd(), "presets.json");
    if (req.method === "GET") {
      try {
        const data = fs.readFileSync(presetFile, "utf8");
        res.setHeader("Content-Type", "application/json");
        res.end(data);
      } catch (err) {
        if (err.code === "ENOENT") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ bookmarks: [], scanPresets: [] }));
        } else {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      }
      return;
    }
    if (req.method === "PUT") {
      let body = "";
      req.on("data", (chunk) => { body += chunk.toString(); if (body.length > 1e6) req.destroy(); });
      req.on("end", () => {
        try {
          // Validate it parses as JSON
          JSON.parse(body);
          fs.writeFileSync(presetFile, body);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
  }
  res.statusCode = 404;
  res.end("Not found");
});
httpServer.listen(HTTP_PORT, WS_HOST, () => {
  console.log(`[bridge] HTTP download server listening on http://${WS_HOST}:${HTTP_PORT}/recordings`);
});

// --- WebSocket server ---
let wss;
if (USE_TLS) {
  const { readFileSync, existsSync, mkdirSync } = fs;
  let certFile = CERT_PATH;
  let keyFile = KEY_PATH;
  if (!certFile || !keyFile) {
    // Auto-generate self-signed cert
    if (!existsSync(CERTS_DIR)) mkdirSync(CERTS_DIR, { recursive: true });
    certFile = path.join(CERTS_DIR, "cert.pem");
    keyFile = path.join(CERTS_DIR, "key.pem");
    if (!existsSync(certFile) || !existsSync(keyFile)) {
      console.log("[bridge] generating self-signed certificate (valid for 1 year)…");
      // Use OpenSSL if available — much faster and more compatible than node-forge
      try {
        const { execSync } = await import("node:child_process");
        execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyFile}" -out "${certFile}" -days 365 -nodes -subj "/CN=rtl-sdr-bridge" -addext "subjectAltName=IP:127.0.0.1,DNS:localhost"`, { stdio: "pipe" });
        console.log(`[bridge] cert written to ${certFile}`);
      } catch (err) {
        console.error("[bridge] OpenSSL not available, falling back to ws://");
        console.error("[bridge] install openssl or pass --cert/--key to use wss://");
        process.exit(1);
      }
    }
  }
  const tls = await import("node:tls");
  const tlsServer = tls.createServer({
    cert: readFileSync(certFile),
    key: readFileSync(keyFile),
  });
  wss = new WebSocketServer({ server: tlsServer });
  tlsServer.listen(WS_PORT, WS_HOST, () => {
    console.log(`[bridge] WebSocket (WSS) server listening on wss://${WS_HOST}:${WS_PORT}`);
    console.log(`[bridge]   cert: ${certFile}`);
    console.log(`[bridge]   key : ${keyFile}`);
    console.log(`[bridge]   first connection will need cert trust (self-signed)`);
  });
} else {
  wss = new WebSocketServer({ host: WS_HOST, port: WS_PORT });
  console.log(`[bridge] WebSocket (WS) server listening on ws://${WS_HOST}:${WS_PORT}`);
}

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[bridge] client connected (${clients.size} total)`);
  ws.on("message", (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
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
          sendRtlCommand(RTL_TCP_SET_GAIN_MODE, 1);
        } else {
          currentGainDb = Number(msg.db);
          sendRtlCommand(RTL_TCP_SET_GAIN_MODE, 0);
          sendRtlCommand(RTL_TCP_SET_GAIN, Math.floor(currentGainDb * 10));
        }
        break;
      case "set_ppm":
        currentPpm = Number(msg.ppm) | 0;
        sendRtlCommand(RTL_TCP_SET_FREQ_CORRECTION, currentPpm);
        break;
      case "start": streaming = true; console.log("[bridge] streaming started"); break;
      case "stop": streaming = false; console.log("[bridge] streaming stopped"); break;
      case "status": broadcastStatus(); break;
      case "start_recording":
        startRecording(msg.name);
        broadcastStatus();
        break;
      case "stop_recording": {
        const result = stopRecording();
        broadcastStatus();
        if (result && ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: "recording_complete", payload: result }));
        }
        break;
      }
    }
  });
  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[bridge] client disconnected (${clients.size} total)`);
  });
  ws.on("error", () => { clients.delete(ws); });
  broadcastStatus();
});

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) { out[key] = next; i++; }
      else { out[key] = "true"; }
    }
  }
  return out;
}

connectRtl();

process.on("SIGINT", () => {
  console.log("\n[bridge] shutting down…");
  if (recording) stopRecording();
  if (rtlSocket) rtlSocket.destroy();
  process.exit(0);
});
