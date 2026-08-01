// Records mic audio as PCM via Web Audio and encodes a complete 16-bit mono WAV.
export type WavRecorder = { stop: () => Promise<Blob>; cancel: () => void };

function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(length);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.length; }

  const target = 16000;
  const ratio = sampleRate / target;
  const outLen = Math.floor(merged.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const s = merged[Math.floor(i * ratio)] ?? 0;
    out[i] = Math.max(-1, Math.min(1, s)) * 0x7fff;
  }

  const buffer = new ArrayBuffer(44 + out.length * 2);
  const view = new DataView(buffer);
  const writeStr = (pos: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(pos + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + out.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, target, true);
  view.setUint32(28, target * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, out.length * 2, true);
  new Int16Array(buffer, 44).set(out);
  return new Blob([buffer], { type: "audio/wav" });
}

export async function startWavRecording(): Promise<WavRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  source.connect(node);
  node.connect(ctx.destination);

  const teardown = async () => {
    stream.getTracks().forEach((t) => t.stop());
    node.disconnect();
    source.disconnect();
    const rate = ctx.sampleRate;
    await ctx.close().catch(() => {});
    return rate;
  };

  return {
    stop: async () => {
      const rate = await teardown();
      return encodeWav(chunks, rate);
    },
    cancel: () => { void teardown(); },
  };
}

export async function transcribeBlob(blob: Blob, filename = "recording.wav"): Promise<string> {
  const form = new FormData();
  form.append("file", blob, filename);
  const res = await fetch("/api/transcribe", { method: "POST", body: form });
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || "Transcription failed");
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}
