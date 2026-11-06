
import axios from "axios";
import React, {
  createContext,
  useCallback,
  useEffect,
  useState
} from "react";

export const userDataContext = createContext();

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:8000";

function UserContext({ children }) {
  const [userData, setUserData] = useState(null);
  const [frontendImage, setFrontendImage] = useState(null);
  const [backendImage, setBackendImage] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  // GET CURRENT USER
  const handleCurrentUser = useCallback(async () => {
    try {
      const result = await axios.get(
        `${SERVER_URL}/api/user/current`,
        { withCredentials: true }
      );

      setUserData(result.data);
    } catch (error) {
      console.error(
        "Current user error:",
        error.response?.data || error.message
      );

      setUserData(null);
    }
  }, []);

  // GET GEMINI RESPONSE
  const getGeminiResponse = useCallback(async (command) => {
    try {
      const result = await axios.post(
        `${SERVER_URL}/api/user/asktoassistant`,
        { command },
        { withCredentials: true }
      );

      return result.data;
    } catch (error) {
      console.error(
        "Gemini request error:",
        error.response?.data || error.message
      );

      throw error;
    }
  }, []);

  // LOGOUT
  const logout = useCallback(async () => {
    try {
      await axios.get(
        `${SERVER_URL}/api/auth/logout`,
        { withCredentials: true }
      );
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUserData(null);
      setFrontendImage(null);
      setBackendImage(null);
      setSelectedImage(null);

      localStorage.removeItem("userData");
      sessionStorage.setItem("logoutTime", Date.now().toString());
    }
  }, []);

  useEffect(() => {
    const logoutTime = sessionStorage.getItem("logoutTime");

    if (
      logoutTime &&
      Date.now() - Number(logoutTime) < 5000
    ) {
      setUserData(null);
      sessionStorage.removeItem("logoutTime");
      return;
    }

    handleCurrentUser();
  }, [handleCurrentUser]);

  const value = {
    serverUrl: SERVER_URL,
    userData,
    setUserData,
    backendImage,
    setBackendImage,
    frontendImage,
    setFrontendImage,
    selectedImage,
    setSelectedImage,
    getGeminiResponse,
    logout
  };

  return (
    <userDataContext.Provider value={value}>
      {children}
    </userDataContext.Provider>
  );
}

export default UserContext;
