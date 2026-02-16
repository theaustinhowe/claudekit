const API_BASE = "https://api.elevenlabs.io/v1";

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY not set");
  return key;
}

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  preview_url: string;
}

export async function listVoices(): Promise<ElevenLabsVoice[]> {
  const res = await fetch(`${API_BASE}/voices`, {
    headers: { "xi-api-key": getApiKey() },
  });
  if (!res.ok) throw new Error(`ElevenLabs API error: ${res.status}`);
  const data = await res.json();
  return data.voices || [];
}

export async function generateSpeech(
  text: string,
  voiceId: string,
  settings?: { stability?: number; similarity_boost?: number; speed?: number },
): Promise<Buffer> {
  const res = await fetch(`${API_BASE}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": getApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_monolingual_v1",
      voice_settings: {
        stability: settings?.stability ?? 0.5,
        similarity_boost: settings?.similarity_boost ?? 0.75,
        speed: settings?.speed ?? 1.0,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs TTS error: ${res.status} - ${err}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function previewVoice(text: string, voiceId: string): Promise<Buffer> {
  // Short preview - same as generateSpeech but with shorter text
  const preview = text.slice(0, 200);
  return generateSpeech(preview, voiceId);
}

/**
 * Look up a real ElevenLabs voice ID from a friendly name.
 * Falls back to the provided name (which may already be a voice ID).
 */
export async function getDefaultVoiceId(friendlyName: string): Promise<string> {
  try {
    const voices = await listVoices();
    const match = voices.find((v) => v.name.toLowerCase() === friendlyName.toLowerCase());
    if (match) return match.voice_id;
    // If no match by name, check if the input is already a valid voice ID
    const idMatch = voices.find((v) => v.voice_id === friendlyName);
    if (idMatch) return idMatch.voice_id;
  } catch {
    // API unavailable — fall through
  }
  return friendlyName;
}
