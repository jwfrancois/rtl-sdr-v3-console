"use client";

import { useState } from "react";
import { StatusHeader } from "@/components/sdr/status-header";
import { TransportBar } from "@/components/sdr/transport-bar";
import { SpectrumAnalyzer } from "@/components/sdr/spectrum-analyzer";
import { WaterfallDisplay } from "@/components/sdr/waterfall-display";
import { FrequencyTuner } from "@/components/sdr/frequency-tuner";
import { DemodulatorControls } from "@/components/sdr/demodulator-controls";
import { GainControls } from "@/components/sdr/gain-controls";
import { SignalMeter } from "@/components/sdr/signal-meter";
import { BookmarksPanel } from "@/components/sdr/bookmarks-panel";
import { ActiveStationCard } from "@/components/sdr/active-station-card";
import { AudioOscilloscope } from "@/components/sdr/audio-oscilloscope";
import { ConnectionPanel } from "@/components/sdr/connection-panel";
import { RdsOverlay } from "@/components/sdr/rds-overlay";
import { RecordingPanel } from "@/components/sdr/recording-panel";
import { ScannerPanel } from "@/components/sdr/scanner-panel";
import { FullscreenSpectrum } from "@/components/sdr/fullscreen-spectrum";
import { AdsbPanel } from "@/components/sdr/adsb-panel";
import { AptPanel } from "@/components/sdr/apt-panel";
import { MessagesPanel } from "@/components/sdr/messages-panel";
import { NotchFilterPanel } from "@/components/sdr/notch-filter-panel";
import { AudioRecorder } from "@/components/sdr/audio-recorder";
import { KeyboardShortcuts } from "@/components/sdr/keyboard-shortcuts";
import { useSdrStore } from "@/lib/sdr-store";
import { formatFrequency } from "@/lib/sdr-engine";
import { MousePointer2, Crosshair, Maximize2 } from "lucide-react";

export default function Home() {
  const [hoverFreq, setHoverFreq] = useState<number | null>(null);
  const setFullscreen = useSdrStore((s) => s.setFullscreen);

  return (
    <main className="min-h-screen flex flex-col">
      {/* Top decorative glow line */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[oklch(0.85_0.18_195/0.6)] to-transparent" />

      {/* Fullscreen overlay (mounted always; renders only when active) */}
      <FullscreenSpectrum />

      <div className="flex-1 px-3 sm:px-4 lg:px-6 py-4 max-w-[1800px] mx-auto w-full">
        <StatusHeader />

        {/* Main grid */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* LEFT column: connection + tuner + demod + gain + notch + scanner */}
          <aside className="lg:col-span-3 flex flex-col gap-4">
            <ConnectionPanel />
            <FrequencyTuner />
            <DemodulatorControls />
            <GainControls />
            <NotchFilterPanel />
            <ScannerPanel />
          </aside>

          {/* CENTER column: spectrum + waterfall + transport */}
          <section className="lg:col-span-6 flex flex-col gap-4">
            <TransportBar />

            {/* Spectrum panel */}
            <div className="sdr-panel sdr-panel-glow rounded-xl p-4 relative">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Crosshair className="h-3.5 w-3.5 text-[oklch(0.85_0.18_195)]" />
                  <span className="text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
                    Spectrum Analyzer · HD
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setFullscreen(true)}
                    className="text-[oklch(0.65_0.04_250)] hover:text-[oklch(0.85_0.18_195)] transition-colors"
                    aria-label="Enter fullscreen spectrum mode"
                    title="Fullscreen (ESC to exit)"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                  <div className="text-[11px] sdr-mono text-[oklch(0.55_0.04_250)]">
                    {hoverFreq ? (
                      <span className="text-[oklch(0.85_0.18_195)]">
                        <MousePointer2 className="inline h-3 w-3 mr-1" />
                        {formatFrequency(hoverFreq)}
                      </span>
                    ) : (
                      <span>FFT 512 · 60 fps</span>
                    )}
                  </div>
                </div>
              </div>
              <SpectrumAnalyzer height={220} onHover={setHoverFreq} />
              {/* RDS overlay — only shows on broadcast FM in real mode */}
              <div className="absolute top-12 right-6 w-64 pointer-events-none">
                <div className="pointer-events-auto">
                  <RdsOverlay />
                </div>
              </div>
            </div>

            {/* Waterfall panel */}
            <div className="sdr-panel sdr-panel-glow rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Crosshair className="h-3.5 w-3.5 text-[oklch(0.82_0.16_70)]" />
                  <span className="text-xs uppercase tracking-widest text-[oklch(0.65_0.02_250)]">
                    Waterfall · HD Time-Frequency
                  </span>
                </div>
                <span className="text-[11px] sdr-mono text-[oklch(0.55_0.04_250)]">
                  Viridis colormap
                </span>
              </div>
              <WaterfallDisplay height={280} onHover={setHoverFreq} />
            </div>

            {/* Signal meter + Audio scope */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SignalMeter />
              <AudioOscilloscope height={64} />
            </div>

            {/* ADS-B tracker (only shows when tuned to 1090 MHz) */}
            <AdsbPanel />

            {/* APT weather satellite decoder (only shows at 137 MHz) */}
            <AptPanel />
          </section>

          {/* RIGHT column: station card + audio recorder + recording + messages + bookmarks */}
          <aside className="lg:col-span-3 flex flex-col gap-4">
            <ActiveStationCard />
            <div>
              <RecordingPanel />
              <AudioRecorder />
            </div>
            <MessagesPanel />
            <BookmarksPanel />
          </aside>
        </div>

        {/* Footer hint bar */}
        <footer className="mt-6 mb-2 sdr-panel rounded-xl px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[oklch(0.55_0.04_250)]">
          <div className="flex items-center gap-4">
            <span className="sdr-mono">
              <span className="text-[oklch(0.85_0.18_195)]">Click</span> any digit
              to increment · <span className="text-[oklch(0.85_0.18_195)]">Right-click</span> to decrement
            </span>
            <span className="hidden sm:inline sdr-mono">
              <span className="text-[oklch(0.85_0.18_195)]">Click</span> on the
              spectrum or waterfall to tune
            </span>
            <span className="hidden md:inline sdr-mono">
              <span className="text-[oklch(0.82_0.16_70)]">AUDIO</span> button
              starts synthesized audio output
            </span>
          </div>
          <div className="sdr-mono">
            RTL-SDR V3 · RTL2832U · R820T2 tuner · 24 kHz – 1.75 GHz
          </div>
        </footer>
      </div>

      {/* Floating keyboard shortcuts button + help overlay */}
      <KeyboardShortcuts />
    </main>
  );
}
