import React, { useContext, useEffect, useRef, useState, useCallback } from 'react'
import { userDataContext } from '../context/UserContext'
import { useNavigate } from 'react-router-dom'
import aiImg from "../assets/ai.gif"
import userImg from "../assets/user.gif"
import { CgMenuRight } from "react-icons/cg";
import { RxCross1 } from "react-icons/rx";
import { FaMicrophone, FaStop, FaPaperPlane } from "react-icons/fa";
import { canRecord, startRecording } from "../utils/voiceRecorder"

const SpeechRecognitionAPI =
  typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

// Brave has the speech API but blocks Google's speech service, so it always fails there.
const isBrave = typeof navigator !== "undefined" && !!navigator.brave

// Phones/tablets: always-on listening is unreliable, so we use tap-to-talk there.
const isMobile =
  typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)

// How voice input works in this browser:
//  native -> browser's own speech recognition (Chrome, Edge, Safari)
//  record -> record the mic and let the server transcribe it (Firefox, Brave, others)
//  none   -> no microphone support, typing only
const detectVoiceMode = () => {
  if (SpeechRecognitionAPI && !isBrave) return "native"
  if (canRecord()) return "record"
  return "none"
}

const MIC_BLOCKED = "Microphone is blocked. Click the lock icon in the address bar, allow the microphone, then tap the mic again."

function Home() {
  const { userData, getGeminiResponse, transcribeAudio, logout } = useContext(userDataContext)
  const navigate = useNavigate()

  const [ham, setHam] = useState(false)
  const [started, setStarted] = useState(false)        // user tapped "Start" (unlocks mic + speech)
  const [voiceMode, setVoiceMode] = useState(detectVoiceMode)
  const [status, setStatus] = useState("idle")         // idle | listening | recording | transcribing | thinking | speaking
  const [notice, setNotice] = useState("")
  const [userText, setUserText] = useState("")
  const [aiText, setAiText] = useState("")
  const [typed, setTyped] = useState("")
  const [pendingLink, setPendingLink] = useState(null) // shown when the browser blocks a pop-up

  const recognitionRef = useRef(null)
  const recorderRef = useRef(null)
  const isRecognizingRef = useRef(false)
  const isSpeakingRef = useRef(false)
  const isBusyRef = useRef(false)
  const startedRef = useRef(false)
  const permanentErrorRef = useRef(false)
  const restartTimerRef = useRef(null)
  const speakTimerRef = useRef(null)
  const utteranceRef = useRef(null)
  const voicesRef = useRef([])
  const voiceModeRef = useRef(voiceMode)

  useEffect(() => { voiceModeRef.current = voiceMode }, [voiceMode])

  const assistantName = userData?.assistantName || ""
  const userName = userData?.name || ""
  const handsFree = voiceMode === "native" && !isMobile   // desktop Chrome/Edge: wake-word mode

  // ------------------------------------------------------------ load voices
  useEffect(() => {
    const synth = window.speechSynthesis
    if (!synth) return
    const load = () => { voicesRef.current = synth.getVoices() }
    load()
    synth.addEventListener?.("voiceschanged", load)
    return () => synth.removeEventListener?.("voiceschanged", load)
  }, [])

  // ---------------------------------------------------------------- listening
  const startListening = useCallback(() => {
    const rec = recognitionRef.current
    if (!rec || isRecognizingRef.current || isSpeakingRef.current || isBusyRef.current) return
    try {
      rec.start()
    } catch (e) {
      if (e.name !== "InvalidStateError") console.error("Start error:", e)
    }
  }, [])

  // Desktop native mode keeps listening for the wake word; everything else waits for a tap.
  const scheduleRestart = useCallback((delay = 800) => {
    clearTimeout(restartTimerRef.current)
    if (isMobile || voiceModeRef.current !== "native" || !startedRef.current || permanentErrorRef.current) return
    restartTimerRef.current = setTimeout(startListening, delay)
  }, [startListening])

  // ------------------------------------------------------------------ speaking
  const speak = useCallback((text) => {
    const synth = window.speechSynthesis
    clearTimeout(speakTimerRef.current)
    if (!synth || !text) {
      isSpeakingRef.current = false
      setStatus("idle")
      scheduleRestart()
      return
    }

    const utterance = new SpeechSynthesisUtterance(text)
    const voices = voicesRef.current.length ? voicesRef.current : synth.getVoices()
    const voice =
      voices.find(v => v.lang === "hi-IN") ||
      voices.find(v => v.lang === "en-IN") ||
      voices.find(v => v.lang?.startsWith("en") && v.localService) ||
      voices.find(v => v.lang?.startsWith("en"))
    if (voice) {
      utterance.voice = voice
      utterance.lang = voice.lang
    } else {
      utterance.lang = "en-US"
    }

    // Keep a reference: Chrome can garbage-collect the utterance and never fire onend.
    utteranceRef.current = utterance

    const done = () => {
      if (utteranceRef.current !== utterance) return // an older, cancelled utterance
      utteranceRef.current = null
      clearTimeout(speakTimerRef.current)
      isSpeakingRef.current = false
      setStatus("idle")
      setAiText("")
      scheduleRestart()
    }
    utterance.onend = done
    utterance.onerror = done

    try { recognitionRef.current?.abort() } catch { /* ignore */ }
    isSpeakingRef.current = true
    setStatus("speaking")
    if (synth.speaking || synth.pending) synth.cancel()
    synth.resume() // Chrome sometimes leaves the speech queue paused
    synth.speak(utterance)

    // Safety net: some browsers never fire onend - don't get stuck on "Speaking..."
    speakTimerRef.current = setTimeout(done, 4000 + text.length * 120)
  }, [scheduleRestart])

  const stopSpeaking = () => {
    clearTimeout(speakTimerRef.current)
    utteranceRef.current = null
    window.speechSynthesis?.cancel()
    isSpeakingRef.current = false
  }

  // ------------------------------------------------------------ open websites
  const openUrl = useCallback((url, label) => {
    const win = window.open(url, '_blank')
    if (!win || win.closed || typeof win.closed === 'undefined') {
      setPendingLink({ url, label })
    } else {
      setPendingLink(null)
    }
  }, [])

  const handleCommand = useCallback((data) => {
    const { type, userInput, response, url } = data
    const query = encodeURIComponent(userInput || "")
    switch (type) {
      case 'google-search':
        openUrl(query ? `https://www.google.com/search?q=${query}` : 'https://www.google.com/', 'Google'); break
      case 'calculator-open':
        openUrl('https://www.google.com/search?q=calculator', 'Calculator'); break
      case 'instagram-open':
        openUrl('https://www.instagram.com/', 'Instagram'); break
      case 'facebook-open':
        openUrl('https://www.facebook.com/', 'Facebook'); break
      case 'weather-show':
        openUrl('https://www.google.com/search?q=weather', 'Weather'); break
      case 'youtube-open':
        openUrl('https://www.youtube.com/', 'YouTube'); break
      case 'youtube-play':
        openUrl(url || (query ? `https://www.youtube.com/results?search_query=${query}` : 'https://www.youtube.com/'), url ? 'video' : 'YouTube'); break
      case 'youtube-search':
        openUrl(query ? `https://www.youtube.com/results?search_query=${query}` : 'https://www.youtube.com/', 'YouTube'); break
      default:
        break
    }
    speak(response)
  }, [speak, openUrl])

  // ------------------------------------------- send a command to the backend
  const runCommand = useCallback(async (text) => {
    const command = text.trim()
    if (!command || isBusyRef.current) return
    isBusyRef.current = true
    try { recognitionRef.current?.abort() } catch { /* ignore */ }
    setPendingLink(null)
    setNotice("")
    setUserText(command)
    setAiText("")
    setStatus("thinking")
    try {
      const data = await getGeminiResponse(command)
      setAiText(data.response)
      isBusyRef.current = false
      handleCommand(data)
    } catch (error) {
      const msg = error.response?.data?.response || "Sorry, I couldn't reach the server. Please try again."
      setAiText(msg)
      isBusyRef.current = false
      speak(msg)
    } finally {
      setUserText("")
    }
  }, [getGeminiResponse, handleCommand, speak])

  const runCommandRef = useRef(runCommand)
  useEffect(() => { runCommandRef.current = runCommand }, [runCommand])

  // ---------------------------------------------- native speech recognition
  useEffect(() => {
    if (voiceMode !== "native" || !SpeechRecognitionAPI) return

    const rec = new SpeechRecognitionAPI()
    rec.continuous = !isMobile
    rec.interimResults = false
    rec.lang = 'en-IN'
    recognitionRef.current = rec

    rec.onstart = () => {
      isRecognizingRef.current = true
      setStatus(s => (s === "thinking" || s === "speaking") ? s : "listening")
    }
    rec.onend = () => {
      isRecognizingRef.current = false
      setStatus(s => s === "listening" ? "idle" : s)
      if (!isBusyRef.current && !isSpeakingRef.current) scheduleRestart(1000)
    }
    rec.onerror = (event) => {
      isRecognizingRef.current = false
      if (event.error === "no-speech" || event.error === "aborted") return
      console.warn("Recognition error:", event.error)

      if (event.error === "not-allowed") {
        permanentErrorRef.current = true
        setNotice(MIC_BLOCKED)
      } else if (event.error === "network" || event.error === "service-not-allowed" || event.error === "language-not-supported") {
        // Browser's speech service unavailable -> switch to recording + server transcription
        permanentErrorRef.current = true
        if (canRecord()) {
          setVoiceMode("record")
          setNotice("Switched to recording mode for this browser. Tap the mic, speak, then wait.")
        } else {
          setNotice("Voice isn't available in this browser. Please type your command below.")
        }
      } else if (event.error === "audio-capture") {
        permanentErrorRef.current = true
        setNotice("No microphone found.")
      }
    }
    rec.onresult = (e) => {
      const transcript = e.results[e.results.length - 1][0].transcript.trim()
      if (!transcript) return
      // Desktop (always listening): only react when the assistant's name is said.
      // Mobile (tap-to-talk): the tap is the trigger, so any sentence counts.
      if (!isMobile && assistantName && !transcript.toLowerCase().includes(assistantName.toLowerCase())) return
      runCommandRef.current(transcript)
    }

    return () => {
      clearTimeout(restartTimerRef.current)
      rec.onend = null
      rec.onerror = null
      rec.onresult = null
      try { rec.abort() } catch { /* ignore */ }
      if (recognitionRef.current === rec) recognitionRef.current = null
      isRecognizingRef.current = false
    }
  }, [voiceMode, assistantName, scheduleRestart])

  // stop everything when leaving the page
  useEffect(() => () => {
    clearTimeout(speakTimerRef.current)
    recorderRef.current?.stop()
    window.speechSynthesis?.cancel()
  }, [])

  // ------------------------------------------- record mode (Firefox, Brave...)
  const recordOnce = async () => {
    let recorder
    try {
      recorder = startRecording()
    } catch (error) {
      console.error("Recorder error:", error)
      setNotice("Couldn't start the microphone. Please type your command below.")
      return
    }
    recorderRef.current = recorder
    setStatus("recording")
    setNotice("")
    try {
      const { audio, mimeType } = await recorder.done
      recorderRef.current = null
      if (!audio) {
        setStatus("idle")
        setNotice("I didn't hear anything. Tap the mic and speak.")
        return
      }
      setStatus("transcribing")
      const text = await transcribeAudio(audio, mimeType)
      if (!text) {
        setStatus("idle")
        setNotice("I couldn't understand that. Tap the mic and try again.")
        return
      }
      runCommand(text)
    } catch (error) {
      recorderRef.current = null
      setStatus("idle")
      if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
        setNotice(MIC_BLOCKED)
      } else if (error?.name === "NotFoundError") {
        setNotice("No microphone found.")
      } else {
        console.error("Voice error:", error)
        setNotice(error.response?.data?.message || "Something went wrong with the voice input. Please try again.")
      }
    }
  }

  // ------------------------------------------------------------- UI actions
  // First tap: unlocks microphone + speech (browsers require a user tap).
  const handleStart = () => {
    startedRef.current = true
    permanentErrorRef.current = false
    setStarted(true)
    if (voiceMode === "none") {
      setNotice("Voice isn't supported in this browser. Please type your command below.")
    }
    const hello = handsFree
      ? `Hello ${userName}, say ${assistantName} followed by your command.`
      : `Hello ${userName}, tap the mic and speak.`
    speak(hello) // when it finishes, hands-free mode starts listening automatically
  }

  const handleMic = () => {
    if (status === "recording") {
      recorderRef.current?.stop()
      return
    }
    if (status === "listening") {
      try { recognitionRef.current?.stop() } catch { /* ignore */ }
      return
    }
    stopSpeaking()
    permanentErrorRef.current = false
    setNotice("")

    if (voiceMode === "record") {
      recordOnce()
    } else {
      startListening()
    }
  }

  const handleTypedSubmit = (e) => {
    e.preventDefault()
    if (!startedRef.current) {
      startedRef.current = true
      setStarted(true)
    }
    runCommand(typed)
    setTyped("")
  }

  const handleLogOut = async () => {
    startedRef.current = false
    clearTimeout(restartTimerRef.current)
    try { recognitionRef.current?.abort() } catch { /* ignore */ }
    recorderRef.current?.stop()
    stopSpeaking()
    await logout()
    navigate("/signin", { replace: true })
  }

  const statusLabel = {
    idle: started && voiceMode !== "none" ? (handsFree ? `Say "${assistantName}" + your command` : "Tap the mic to speak") : "",
    listening: "Listening...",
    recording: "Listening... (tap to stop)",
    transcribing: "Understanding...",
    thinking: "Thinking...",
    speaking: "Speaking...",
  }[status]

  const micActive = status === "listening" || status === "recording"
  const micBusy = status === "thinking" || status === "transcribing"

  // ------------------------------------------------------------------ render
  return (
    <div className='w-full min-h-[100dvh] bg-gradient-to-t from-[black] to-[#02023d] flex justify-center items-center flex-col gap-[12px] overflow-x-hidden px-[16px] py-[70px] relative'>
      {/* mobile menu */}
      <CgMenuRight className='lg:hidden text-white absolute top-[20px] right-[20px] w-[28px] h-[28px] cursor-pointer z-10' onClick={() => setHam(true)} />
      <div className={`fixed lg:hidden inset-0 z-20 bg-[#000000c0] backdrop-blur-lg p-[20px] flex flex-col gap-[20px] items-start ${ham ? "translate-x-0" : "translate-x-full"} transition-transform`}>
        <RxCross1 className='text-white absolute top-[20px] right-[20px] w-[25px] h-[25px] cursor-pointer' onClick={() => setHam(false)} />
        <button className='min-w-[150px] h-[50px] text-black font-semibold bg-white rounded-full cursor-pointer text-[17px] px-[20px]' onClick={handleLogOut}>Log Out</button>
        <button className='min-w-[150px] h-[50px] text-black font-semibold bg-white rounded-full cursor-pointer text-[17px] px-[20px]' onClick={() => navigate("/customize")}>Customize your Assistant</button>
        <div className='w-full h-[2px] bg-gray-400'></div>
        <h1 className='text-white font-semibold text-[19px]'>History</h1>
        <div className='w-full flex-1 gap-[14px] overflow-y-auto flex flex-col'>
          {userData?.history?.map((his, index) => (
            <div key={index} className='text-gray-200 text-[16px] w-full truncate'>{his}</div>
          ))}
        </div>
      </div>

      {/* desktop buttons */}
      <button className='min-w-[150px] h-[55px] text-black font-semibold absolute hidden lg:block top-[20px] right-[20px] bg-white rounded-full cursor-pointer text-[18px]' onClick={handleLogOut}>Log Out</button>
      <button className='min-w-[150px] h-[55px] text-black font-semibold bg-white absolute top-[90px] right-[20px] rounded-full cursor-pointer text-[18px] px-[20px] hidden lg:block' onClick={() => navigate("/customize")}>Customize your Assistant</button>

      {/* assistant */}
      <div className='w-[min(300px,70vw)] aspect-[3/4] flex justify-center items-center overflow-hidden rounded-4xl shadow-lg'>
        <img src={userData?.assistantImage} alt="assistant" className='h-full w-full object-cover' />
      </div>
      <h1 className='text-white text-[18px] font-semibold'>I'm {assistantName}</h1>

      {status === "speaking" || aiText
        ? <img src={aiImg} alt="" className='w-[140px] lg:w-[180px]' />
        : <img src={userImg} alt="" className='w-[140px] lg:w-[180px]' />}

      {(userText || aiText) && (
        <p className='text-white text-[17px] font-semibold text-center max-w-[600px] break-words'>{userText || aiText}</p>
      )}

      {/* controls */}
      {!started ? (
        <button
          className='h-[56px] px-[28px] mt-[6px] bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-full cursor-pointer text-[18px] flex items-center gap-[10px]'
          onClick={handleStart}
        >
          <FaMicrophone /> Tap to start {assistantName}
        </button>
      ) : (
        voiceMode !== "none" && (
          <button
            aria-label={micActive ? "Stop listening" : "Start listening"}
            className={`w-[64px] h-[64px] rounded-full flex items-center justify-center text-white text-[24px] cursor-pointer transition-colors disabled:opacity-50 ${micActive ? "bg-red-500 animate-pulse" : "bg-blue-500 hover:bg-blue-600"}`}
            onClick={handleMic}
            disabled={micBusy}
          >
            {micActive ? <FaStop /> : <FaMicrophone />}
          </button>
        )
      )}

      {statusLabel && <p className='text-blue-200 text-[15px] text-center'>{statusLabel}</p>}
      {notice && <p className='text-yellow-300 text-[14px] text-center max-w-[500px]'>{notice}</p>}

      {pendingLink && (
        <div className='flex flex-col items-center gap-[6px]'>
          <button
            className='min-w-[200px] h-[48px] bg-green-500 text-white font-semibold rounded-full cursor-pointer text-[17px] px-[20px]'
            onClick={() => { window.open(pendingLink.url, '_blank'); setPendingLink(null) }}
          >
            Open {pendingLink.label}
          </button>
          <p className='text-gray-400 text-[13px] text-center'>Pop-up was blocked. Allow pop-ups for this site to open links automatically.</p>
        </div>
      )}

      {/* type a command - works in every browser */}
      <form onSubmit={handleTypedSubmit} className='w-full max-w-[500px] flex items-center gap-[8px] mt-[6px]'>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder='Or type a command, e.g. play kesariya'
          className='flex-1 min-w-0 h-[48px] rounded-full bg-transparent border-2 border-white text-white placeholder-gray-400 px-[18px] outline-none text-[16px]'
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!typed.trim() || status === "thinking"}
          className='w-[48px] h-[48px] shrink-0 rounded-full bg-white text-black flex items-center justify-center cursor-pointer disabled:opacity-50'
        >
          <FaPaperPlane />
        </button>
      </form>
    </div>
  )
}

export default Home
