import React, { useContext, useEffect, useRef, useState, useCallback } from 'react'
import { userDataContext } from '../context/UserContext'
import { useNavigate } from 'react-router-dom'
import aiImg from "../assets/ai.gif"
import { CgMenuRight } from "react-icons/cg";
import { RxCross1 } from "react-icons/rx";
import userImg from "../assets/user.gif"

function Home() {
  const {userData,getGeminiResponse,logout}=useContext(userDataContext)
  const navigate=useNavigate()
  const [,setListening]=useState(false)
  const [userText,setUserText]=useState("")
  const [aiText,setAiText]=useState("")
  const isSpeakingRef=useRef(false)
  const recognitionRef=useRef(null)
  const [ham,setHam]=useState(false)
  const [pendingLink,setPendingLink]=useState(null) // shown when the browser blocks a pop-up
  const isRecognizingRef=useRef(false)

  const assistantName = userData?.assistantName || ""
  const userName = userData?.name || ""

  const handleLogOut=async ()=>{
    recognitionRef.current?.stop()
    window.speechSynthesis?.cancel()
    await logout()
    navigate("/signin", { replace: true })
  }

  const startRecognition = useCallback(() => {
    if (!isSpeakingRef.current && !isRecognizingRef.current) {
      try {
        recognitionRef.current?.start();
        console.log("Recognition requested to start");
      } catch (error) {
        if (error.name !== "InvalidStateError") {
          console.error("Start error:", error);
        }
      }
    }
  }, [])

  const speak=useCallback((text)=>{
    const synth=window.speechSynthesis
    if (!synth || !text) {
      startRecognition()
      return
    }
    const utterence=new SpeechSynthesisUtterance(text)
    utterence.lang = 'hi-IN';
    const voices = synth.getVoices()
    const hindiVoice = voices.find(v => v.lang === 'hi-IN');
    if (hindiVoice) {
      utterence.voice = hindiVoice;
    }

    isSpeakingRef.current=true
    const done = ()=>{
      setAiText("");
      isSpeakingRef.current = false;
      setTimeout(() => {
        startRecognition(); // delay avoids a race with recognition.onend
      }, 800);
    }
    utterence.onend=done
    utterence.onerror=done
    synth.cancel(); // stop any speech already playing
    synth.speak(utterence);
  }, [startRecognition])

  // Open a site in a new tab. Browsers block pop-ups that don't come from a click,
  // so if it's blocked we show a button the user can click instead.
  const openUrl=useCallback((url, label)=>{
    const win = window.open(url, '_blank')
    if (!win || win.closed || typeof win.closed === 'undefined') {
      setPendingLink({ url, label })
    } else {
      setPendingLink(null)
    }
  }, [])

  const handleCommand=useCallback((data)=>{
    const {type,userInput,response,url}=data
    speak(response);

    const query = encodeURIComponent(userInput || "");
    switch (type) {
      case 'google-search':
        openUrl(query ? `https://www.google.com/search?q=${query}` : 'https://www.google.com/', 'Google')
        break
      case 'calculator-open':
        openUrl('https://www.google.com/search?q=calculator', 'Calculator')
        break
      case 'instagram-open':
        openUrl('https://www.instagram.com/', 'Instagram')
        break
      case 'facebook-open':
        openUrl('https://www.facebook.com/', 'Facebook')
        break
      case 'weather-show':
        openUrl('https://www.google.com/search?q=weather', 'Weather')
        break
      case 'youtube-open':
        openUrl('https://www.youtube.com/', 'YouTube')
        break
      case 'youtube-play':
        // backend sends the top video's URL -> open it directly so it starts playing
        if (url) {
          openUrl(url, 'video')
        } else {
          openUrl(query ? `https://www.youtube.com/results?search_query=${query}` : 'https://www.youtube.com/', 'YouTube')
        }
        break
      case 'youtube-search':
        openUrl(query ? `https://www.youtube.com/results?search_query=${query}` : 'https://www.youtube.com/', 'YouTube')
        break
      default:
        break
    }
  }, [speak, openUrl])

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.log("Speech recognition not supported in this browser (use Chrome or Edge)");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognitionRef.current = recognition;

    let isMounted = true;  // avoid setState on an unmounted component

    const startTimeout = setTimeout(() => {
      if (isMounted && !isSpeakingRef.current && !isRecognizingRef.current) {
        try {
          recognition.start();
          console.log("Recognition requested to start");
        } catch (e) {
          if (e.name !== "InvalidStateError") {
            console.error(e);
          }
        }
      }
    }, 1000);

    recognition.onstart = () => {
      isRecognizingRef.current = true;
      setListening(true);
    };

    recognition.onend = () => {
      isRecognizingRef.current = false;
      setListening(false);
      if (isMounted && !isSpeakingRef.current) {
        setTimeout(() => {
          if (isMounted) {
            try {
              recognition.start();
              console.log("Recognition restarted");
            } catch (e) {
              if (e.name !== "InvalidStateError") console.error(e);
            }
          }
        }, 1000);
      }
    };

    recognition.onerror = (event) => {
      console.warn("Recognition error:", event.error);
      isRecognizingRef.current = false;
      setListening(false);

      if (event.error === "network" || event.error === "not-allowed" || event.error === "service-not-allowed") {
        console.log("Stopping recognition due to permanent error:", event.error);
        return;
      }

      if (event.error !== "aborted" && isMounted && !isSpeakingRef.current) {
        setTimeout(() => {
          if (isMounted) {
            try {
              recognition.start();
              console.log("Recognition restarted after error");
            } catch (e) {
              if (e.name !== "InvalidStateError") console.error(e);
            }
          }
        }, 2000);
      }
    };

    recognition.onresult = async (e) => {
      const transcript = e.results[e.results.length - 1][0].transcript.trim();
      if (!assistantName || !transcript.toLowerCase().includes(assistantName.toLowerCase())) {
        return;
      }
      setAiText("");
      setUserText(transcript);
      recognition.stop();
      isRecognizingRef.current = false;
      setListening(false);
      try {
        const data = await getGeminiResponse(transcript);
        if (!isMounted) return;
        handleCommand(data);
        setAiText(data.response);
      } catch (error) {
        if (!isMounted) return;
        const msg = error.response?.data?.response || "Sorry, something went wrong. Please try again.";
        speak(msg);
        setAiText(msg);
      } finally {
        if (isMounted) setUserText("");
      }
    };

    const greeting = new SpeechSynthesisUtterance(`Hello ${userName}, what can I help you with?`);
    greeting.lang = 'hi-IN';
    window.speechSynthesis?.speak(greeting);

    return () => {
      isMounted = false;
      clearTimeout(startTimeout);
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.stop();
      window.speechSynthesis?.cancel();
      setListening(false);
      isRecognizingRef.current = false;
    };
  }, [getGeminiResponse, handleCommand, speak, assistantName, userName]);

  return (
    <div className='w-full h-[100vh] bg-gradient-to-t from-[black] to-[#02023d] flex justify-center items-center flex-col gap-[15px] overflow-hidden'>
      <CgMenuRight className='lg:hidden text-white absolute top-[20px] right-[20px] w-[25px] h-[25px]' onClick={()=>setHam(true)}/>
      <div className={`absolute lg:hidden top-0 w-full h-full bg-[#00000053] backdrop-blur-lg p-[20px] flex flex-col gap-[20px] items-start ${ham?"translate-x-0":"translate-x-full"} transition-transform`}>
        <RxCross1 className=' text-white absolute top-[20px] right-[20px] w-[25px] h-[25px]' onClick={()=>setHam(false)}/>
        <button className='min-w-[150px] h-[60px]  text-black font-semibold   bg-white rounded-full cursor-pointer text-[19px] ' onClick={handleLogOut}>Log Out</button>
        <button className='min-w-[150px] h-[60px]  text-black font-semibold  bg-white  rounded-full cursor-pointer text-[19px] px-[20px] py-[10px] ' onClick={()=>navigate("/customize")}>Customize your Assistant</button>

        <div className='w-full h-[2px] bg-gray-400'></div>
        <h1 className='text-white font-semibold text-[19px]'>History</h1>

        <div className='w-full h-[400px] gap-[20px] overflow-y-auto flex flex-col'>
          {userData?.history?.map((his, index)=>(
            <div key={index} className='text-gray-200 text-[18px] w-full h-[30px] truncate'>{his}</div>
          ))}
        </div>
      </div>
      <button className='min-w-[150px] h-[60px] mt-[30px] text-black font-semibold absolute hidden lg:block top-[20px] right-[20px]  bg-white rounded-full cursor-pointer text-[19px] ' onClick={handleLogOut}>Log Out</button>
      <button className='min-w-[150px] h-[60px] mt-[30px] text-black font-semibold  bg-white absolute top-[100px] right-[20px] rounded-full cursor-pointer text-[19px] px-[20px] py-[10px] hidden lg:block ' onClick={()=>navigate("/customize")}>Customize your Assistant</button>
      <div className='w-[300px] h-[400px] flex justify-center items-center overflow-hidden rounded-4xl shadow-lg'>
        <img src={userData?.assistantImage} alt="assistant" className='h-full object-cover'/>
      </div>
      <h1 className='text-white text-[18px] font-semibold'>I'm {userData?.assistantName}</h1>
      {!aiText && <img src={userImg} alt="" className='w-[200px]'/>}
      {aiText && <img src={aiImg} alt="" className='w-[200px]'/>}

      <h1 className='text-white text-[18px] font-semibold text-wrap'>{userText?userText:aiText?aiText:null}</h1>

      {pendingLink && (
        <div className='flex flex-col items-center gap-[8px]'>
          <button
            className='min-w-[200px] h-[50px] bg-blue-500 text-white font-semibold rounded-full cursor-pointer text-[18px] px-[20px]'
            onClick={()=>{ window.open(pendingLink.url, '_blank'); setPendingLink(null) }}
          >
            Open {pendingLink.label}
          </button>
          <p className='text-gray-400 text-[13px] text-center'>Pop-up was blocked. Allow pop-ups for this site to open links automatically.</p>
        </div>
      )}
    </div>
  )
}

export default Home
