"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, csrfHeaders } from "@/lib/api/client";

interface VoiceOption {
  id: string;
  name: string;
  language: string;
}

const SPEEDS = [0.75, 1, 1.25, 1.5];

/** §16: synthesizes and plays back an assistant reply. Playback rate, volume, and
 * cancellation are real controls over a real <audio> element — not decorative. */
export function VoicePlaybackButton({ text, voices }: { text: string; voices: VoiceOption[] }) {
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const voiceId = voices[0]?.id;

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
      audioRef.current.volume = volume;
    }
  }, [speed, volume]);

  const play = async () => {
    setError(null);
    if (!voiceId) {
      setError("No hay voces disponibles.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/speech/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ text, voiceId, speed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(body?.error?.message ?? "No fue posible generar el audio.", body?.error?.code ?? "UNKNOWN", res.status);
      }
      const blob = await res.blob();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      const audio = new Audio(url);
      audio.playbackRate = speed;
      audio.volume = volume;
      audio.onended = () => setPlaying(false);
      audioRef.current = audio;
      await audio.play();
      setPlaying(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No fue posible reproducir el audio.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setPlaying(false);
  };

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={playing ? cancel : play}
        disabled={busy}
        className="rounded border border-border px-2 py-0.5 hover:text-ink disabled:opacity-50"
      >
        {busy ? "Generando…" : playing ? "⏹ Detener" : "🔊 Escuchar"}
      </button>
      {playing && (
        <>
          <label className="flex items-center gap-1">
            Velocidad
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="rounded border border-border bg-surface px-1 py-0.5"
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}x
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            Volumen
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volumen de reproducción"
            />
          </label>
        </>
      )}
    </div>
  );
}
