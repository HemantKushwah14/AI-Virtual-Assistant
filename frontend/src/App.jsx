import React, { useContext } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import SignUp from './pages/SignUp'
import SignIn from './pages/SignIn'
import Customize from './pages/Customize'
import { userDataContext } from './context/UserContext'
import Home from './pages/Home'
import Customize2 from './pages/Customize2'

function App() {
  const {userData}=useContext(userDataContext)
  
  // Check if user is fully set up (has assistant image and name)
  const isUserSetup = userData?.assistantImage && userData?.assistantName
  
  return (
   <Routes>
     <Route path='/' element={isUserSetup ? <Home/> : <Navigate to={userData ? "/customize" : "/signin"}/>}/>
     <Route path='/signup' element={!userData ? <SignUp/> : <Navigate to="/"/>}/>
     <Route path='/signin' element={!userData ? <SignIn/> : <Navigate to="/"/>}/>
     <Route path='/customize' element={userData ? <Customize/> : <Navigate to="/signin"/>}/>
     <Route path='/customize2' element={userData ? <Customize2/> : <Navigate to="/signin"/>}/>
     <Route path='*' element={<Navigate to="/signin"/>}/>
   </Routes>
  )
}

export default App
