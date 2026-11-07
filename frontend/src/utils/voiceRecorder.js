// Records the microphone until the user stops talking, then returns a 16 kHz mono WAV
// as base64. Used for browsers that have no built-in speech recognition
// (Firefox, Brave, some mobile browsers) - the server turns the audio into text.
//
// Works in every modern browser: it only uses getUserMedia + Web Audio.

const TARGET_RATE = 16000

const downsample = (buffer, inputRate) => {
  if (inputRate === TARGET_RATE) return buffer
  const ratio = inputRate / TARGET_RATE
  const length = Math.floor(buffer.length / ratio)
  const result = new Float32Array(length)
  let pos = 0
  for (let i = 0; i < length; i++) {
    const next = Math.floor((i + 1) * ratio)
    let sum = 0
    let count = 0
    for (let j = pos; j < next && j < buffer.length; j++) {
      sum += buffer[j]
      count++
    }
    result[i] = count ? sum / count : 0
    pos = next
  }
  return result
}

const encodeWav = (samples) => {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeString(0, "RIFF")
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true)          // PCM chunk size
  view.setUint16(20, 1, true)           // PCM format
  view.setUint16(22, 1, true)           // mono
  view.setUint32(24, TARGET_RATE, true)
  view.setUint32(28, TARGET_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)          // 16-bit
  writeString(36, "data")
  view.setUint32(40, samples.length * 2, true)
  let offset = 44
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buffer
}

const toBase64 = (arrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export const canRecord = () =>
  typeof navigator !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia &&
  !!(window.AudioContext || window.webkitAudioContext)

/**
 * Start recording. Must be called from a click/tap (browsers require it).
 * Returns { done, stop }:
 *   done -> Promise<{ audio: base64 | null, mimeType }>  (audio null = nothing was said)
 *   stop -> stop early (e.g. user taps the button again)
 */
export const startRecording = ({ maxMs = 10000, silenceMs = 1500, waitForSpeechMs = 6000 } = {}) => {
  // Create the AudioContext synchronously inside the tap (needed on iPhone/Safari)
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  const ctx = new AudioCtx()
  ctx.resume?.()

  let stopFn = () => {}
  const done = (async () => {
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }
      })
    } catch (error) {
      ctx.close?.()
      throw error
    }

    const source = ctx.createMediaStreamSource(stream)
    const processor = ctx.createScriptProcessor(4096, 1, 1)
    const chunks = []
    let heardSpeech = false
    let lastLoud = 0
    const startedAt = performance.now()

    return await new Promise((resolve) => {
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        processor.disconnect()
        source.disconnect()
        stream.getTracks().forEach((t) => t.stop())
        const inputRate = ctx.sampleRate
        ctx.close?.()

        if (!heardSpeech || chunks.length === 0) {
          resolve({ audio: null, mimeType: "audio/wav" })
          return
        }
        const total = chunks.reduce((n, c) => n + c.length, 0)
        const merged = new Float32Array(total)
        let offset = 0
        for (const c of chunks) {
          merged.set(c, offset)
          offset += c.length
        }
        const wav = encodeWav(downsample(merged, inputRate))
        resolve({ audio: toBase64(wav), mimeType: "audio/wav" })
      }
      stopFn = finish

      processor.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0)
        chunks.push(new Float32Array(data))

        // simple voice-activity detection
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
        const rms = Math.sqrt(sum / data.length)
        const now = performance.now()
        if (rms > 0.02) {
          heardSpeech = true
          lastLoud = now
        }

        const elapsed = now - startedAt
        if (
          elapsed > maxMs ||
          (!heardSpeech && elapsed > waitForSpeechMs) ||
          (heardSpeech && now - lastLoud > silenceMs)
        ) {
          finish()
        }
      }

      source.connect(processor)
      processor.connect(ctx.destination)
    })
  })()

  return { done, stop: () => stopFn() }
}
