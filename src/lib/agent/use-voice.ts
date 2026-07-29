"use client";

// Phase B: live speech-to-speech voice mode via OpenAI Realtime over WebRTC.
// The Realtime model is a thin voice front-end: substantive work is delegated
// to the worker's Claude agent loop via run_agent_task (driven through /agui
// so the on-screen activity feed streams during the call). Barge-in is
// automatic with server-managed VAD over WebRTC.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAgentAuthHeaders,
  getAgentBaseUrl,
  type AgentResult,
} from "@/lib/agent/agui-client";

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

export type VoiceStatus = "idle" | "connecting" | "live" | "error";

export interface VoiceStartOptions {
  /** JSON-serializable contact record to inject as session context. */
  contact: unknown | null;
  /** Runs a delegated agent task; resolves with the structured result. */
  runTask: (request: string) => Promise<AgentResult | null>;
}

export interface UseVoice {
  status: VoiceStatus;
  error: string | null;
  start: (options: VoiceStartOptions) => Promise<void>;
  stop: () => void;
}

interface RealtimeFunctionCall {
  type: "function_call";
  name: string;
  call_id: string;
  arguments: string;
}

export function useVoice(): UseVoice {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const runTaskRef = useRef<VoiceStartOptions["runTask"] | null>(null);

  const stop = useCallback(() => {
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    micRef.current?.getTracks().forEach((track) => track.stop());
    micRef.current = null;
    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current = null;
    }
    runTaskRef.current = null;
    setStatus("idle");
  }, []);

  useEffect(() => stop, [stop]);

  const sendEvent = useCallback((event: Record<string, unknown>) => {
    const dc = dcRef.current;
    if (dc && dc.readyState === "open") {
      dc.send(JSON.stringify(event));
    }
  }, []);

  const handleFunctionCall = useCallback(
    async (call: RealtimeFunctionCall) => {
      let output: string;
      try {
        if (call.name === "run_agent_task") {
          const args = JSON.parse(call.arguments || "{}") as { request?: string };
          const result = await runTaskRef.current?.(String(args.request ?? ""));
          output = JSON.stringify(
            result ?? { error: "The agent did not produce a structured result." }
          );
        } else {
          // Direct tools (get_contact, ...) execute in the worker.
          const response = await fetch(`${getAgentBaseUrl()}/realtime/tool`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...getAgentAuthHeaders(),
            },
            body: JSON.stringify({ name: call.name, arguments: call.arguments }),
          });
          const payload = (await response.json()) as { output?: string };
          output = payload.output ?? JSON.stringify(payload);
        }
      } catch (err) {
        output = JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        });
      }

      sendEvent({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: call.call_id, output },
      });
      sendEvent({ type: "response.create" });
    },
    [sendEvent]
  );

  const handleServerEvent = useCallback(
    (raw: string) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return;
      }

      if (event.type === "response.done") {
        const response = event.response as
          | { output?: Array<Record<string, unknown>> }
          | undefined;
        for (const item of response?.output ?? []) {
          if (item.type === "function_call") {
            void handleFunctionCall(item as unknown as RealtimeFunctionCall);
          }
        }
      } else if (event.type === "error") {
        const detail = event.error as { message?: string } | undefined;
        console.error("[voice] Realtime error:", detail?.message ?? event);
      }
    },
    [handleFunctionCall]
  );

  const start = useCallback(
    async ({ contact, runTask }: VoiceStartOptions) => {
      if (pcRef.current) return;
      setError(null);
      setStatus("connecting");
      runTaskRef.current = runTask;

      try {
        let mic: MediaStream;
        try {
          mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          throw new Error(
            "Microphone access was denied. Allow mic access in your browser and try again."
          );
        }
        micRef.current = mic;

        const secretResponse = await fetch(`${getAgentBaseUrl()}/realtime/secret`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...getAgentAuthHeaders(),
          },
          body: JSON.stringify({ contact }),
        });
        if (!secretResponse.ok) {
          const detail = await secretResponse.text().catch(() => "");
          throw new Error(
            `Could not start a voice session (${secretResponse.status}). ${detail.slice(0, 200)}`
          );
        }
        const secret = (await secretResponse.json()) as { value?: string };
        if (!secret.value) {
          throw new Error("Voice session token response was missing a value.");
        }

        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        const audioEl = document.createElement("audio");
        audioEl.autoplay = true;
        audioRef.current = audioEl;
        pc.ontrack = (e) => {
          audioEl.srcObject = e.streams[0];
        };
        pc.addTrack(mic.getTracks()[0], mic);

        const dc = pc.createDataChannel("oai-events");
        dcRef.current = dc;
        dc.addEventListener("message", (e) => handleServerEvent(e.data as string));
        dc.addEventListener("open", () => setStatus("live"));
        dc.addEventListener("close", () => stop());

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const sdpResponse = await fetch(REALTIME_CALLS_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${secret.value}`,
            "content-type": "application/sdp",
          },
          body: offer.sdp,
        });
        if (!sdpResponse.ok) {
          throw new Error(`Realtime SDP exchange failed (${sdpResponse.status}).`);
        }
        await pc.setRemoteDescription({
          type: "answer",
          sdp: await sdpResponse.text(),
        });
      } catch (err) {
        stop();
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [handleServerEvent, stop]
  );

  return { status, error, start, stop };
}
