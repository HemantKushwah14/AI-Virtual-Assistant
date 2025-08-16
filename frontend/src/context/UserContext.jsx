import axios from 'axios'
import React, { createContext, useEffect, useState } from 'react'
export const userDataContext=createContext()
function UserContext({children}) {
    const serverUrl="http://localhost:8000"
    const [userData,setUserData]=useState(null)
    const [frontendImage,setFrontendImage]=useState(null)
     const [backendImage,setBackendImage]=useState(null)
     const [selectedImage,setSelectedImage]=useState(null)
    const handleCurrentUser=async ()=>{
        // Check if logout just happened (within last 5 seconds)
        const logoutTime = sessionStorage.getItem('logoutTime')
        if (logoutTime && (Date.now() - parseInt(logoutTime)) < 5000) {
            console.log("Skipping user fetch - recent logout detected")
            setUserData(null)
            sessionStorage.removeItem('logoutTime')
            return
        }

        try {
            const result=await axios.get(`${serverUrl}/api/user/current`,{withCredentials:true})
            setUserData(result.data)
            console.log(result.data)
        } catch (error) {
            console.log("Current user fetch error:", error.response?.status, error.response?.data)
            // If there's an error (like no token), ensure userData is null
            setUserData(null)
        }
    }

    const getGeminiResponse=async (command)=>{
try {
  const result=await axios.post(`${serverUrl}/api/user/asktoassistant`,{command},{withCredentials:true})
  return result.data
} catch (error) {
  console.log(error)
}
    }

    const logout = async () => {
      try {
        await axios.get(`${serverUrl}/api/auth/logout`,{withCredentials:true})
      } catch (error) {
        console.log("Logout error:", error)
      } finally {
        // Clear all state regardless of success/failure
        setUserData(null)
        setFrontendImage(null)
        setBackendImage(null)
        setSelectedImage(null)
        // Clear any stored data in localStorage if any
        localStorage.removeItem('userData')
        // Prevent automatic user fetch after logout
        sessionStorage.setItem('logoutTime', Date.now().toString())
      }
    }

    useEffect(()=>{
handleCurrentUser()
    },[])
    const value={
serverUrl,userData,setUserData,backendImage,setBackendImage,frontendImage,setFrontendImage,selectedImage,setSelectedImage,getGeminiResponse,logout
    }
  return (
    <div>
    <userDataContext.Provider value={value}>
      {children}
      </userDataContext.Provider>
    </div>
  )
}

export default UserContext
