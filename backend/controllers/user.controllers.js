import uploadOnCloudinary from "../config/cloudinary.js";
import geminiResponse from "../gemini.js";
import getFirstVideoUrl from "../youtube.js";
import User from "../models/user.model.js";
import moment from "moment";

// GET CURRENT USER
export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    return res.status(200).json(user);

  } catch (error) {
    console.error("Get current user error:", error.message);

    return res.status(500).json({
      message: "Get current user failed"
    });
  }
};


// UPDATE ASSISTANT
export const updateAssistant = async (req, res) => {
  try {
    const { assistantName, imageUrl } = req.body || {};

    if (!assistantName || !assistantName.trim()) {
      return res.status(400).json({
        message: "Assistant name is required"
      });
    }

    let assistantImage;

    if (req.file) {
      assistantImage = await uploadOnCloudinary(req.file.path);
    } else {
      assistantImage = imageUrl;
    }

    if (!assistantImage) {
      return res.status(400).json({
        message: "Assistant image is required"
      });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        assistantName: assistantName.trim(),
        assistantImage
      },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    return res.status(200).json(user);

  } catch (error) {
    console.error("Update assistant error:", error.message);

    return res.status(500).json({
      message: "Assistant update failed"
    });
  }
};


// ASK TO ASSISTANT
export const askToAssistant = async (req, res) => {
  try {
    const { command } = req.body || {};

    if (!command || !command.trim()) {
      return res.status(400).json({
        message: "Command is required"
      });
    }

    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    // SAVE COMMAND IN HISTORY
    user.history.push(command);
    await user.save();

    // CALL GEMINI (already returns a parsed, validated object)
    const gemResult = await geminiResponse(command, user.assistantName, user.name);

    const { type, userInput } = gemResult;

    // HANDLE DATE AND TIME COMMANDS LOCALLY
    switch (type) {
      case "get-date":
        return res.status(200).json({
          type,
          userInput,
          response: `Current date is ${moment().format("YYYY-MM-DD")}`
        });

      case "get-time":
        return res.status(200).json({
          type,
          userInput,
          response: `Current time is ${moment().format("hh:mm A")}`
        });

      case "get-day":
        return res.status(200).json({
          type,
          userInput,
          response: `Today is ${moment().format("dddd")}`
        });

      case "get-month":
        return res.status(200).json({
          type,
          userInput,
          response: `Current month is ${moment().format("MMMM")}`
        });

      case "youtube-play": {
        // Find the top video so the frontend can open & play it directly
        const videoUrl = await getFirstVideoUrl(userInput);
        return res.status(200).json({
          type,
          userInput,
          response: gemResult.response,
          url: videoUrl // null -> frontend falls back to the search results page
        });
      }

      default:
        return res.status(200).json({
          type,
          userInput,
          response: gemResult.response
        });
    }

  } catch (error) {
    console.error("ASK ASSISTANT ERROR:", error.response?.data || error.message);

    const status = error.response?.status;
    let message = "Something went wrong. Please try again.";
    if (status === 503 || status === 429 || /timeout/i.test(error.message || "")) {
      message = "Google's AI is busy right now. Please try again in a moment.";
    } else if (status === 400 || status === 401 || status === 403) {
      message = "My Gemini API key is not working. Please check the key in the env file.";
    }

    return res.status(500).json({
      type: "general",
      response: message
    });
  }
};
