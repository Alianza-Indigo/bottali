"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/lib/api/client";

interface TranscribeResponse {
  text: string;
}

/** §16: records from the browser microphone, sends the clip to be transcribed, and hands the
 * resulting text back to the composer for editing — it never sends a message on its own. The
 * recording itself is only ever held in memory and discarded once transcription completes. */
export function VoiceRecorderButton({
  toolId,
  onTranscribed,
  disabled,
}: {
  toolId: string;
  onTranscribed: (text: string) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stopStream();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        if (blob.size === 0) return;
        setBusy(true);
        try {
          const form = new FormData();
          form.append("audio", blob, "recording.webm");
          form.append("toolId", toolId);
          const result = await apiFetch<TranscribeResponse>("/api/v1/speech/transcribe", { method: "POST", body: form });
          onTranscribed(result.text);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "No fue posible transcribir el audio.");
        } finally {
          setBusy(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError("No fue posible acceder al micrófono. Revisa los permisos del navegador.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        size="md"
        variant={recording ? "danger" : "secondary"}
        loading={busy}
        disabled={disabled}
        aria-pressed={recording}
        aria-label={recording ? "Detener grabación de voz" : "Grabar mensaje de voz"}
        onClick={recording ? stopRecording : startRecording}
      >
        {recording ? "Detener" : "🎤"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
