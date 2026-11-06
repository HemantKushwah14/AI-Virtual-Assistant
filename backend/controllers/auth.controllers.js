import genToken, { cookieOptions } from "../config/token.js";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// Never send the password hash back to the browser
const toSafeUser = (user) => {
  const obj = user.toObject();
  delete obj.password;
  return obj;
};

// SIGNUP
export const signUp = async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "All fields are required!"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters!"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existEmail = await User.findOne({ email: normalizedEmail });

    if (existEmail) {
      return res.status(400).json({
        message: "Email already exists!"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword
    });

    const token = genToken(user._id);

    res.cookie("token", token, {
      ...cookieOptions(),
      maxAge: COOKIE_MAX_AGE
    });

    return res.status(201).json(toSafeUser(user));

  } catch (error) {
    console.error("Signup error:", error.message);

    return res.status(500).json({
      message: "Signup failed"
    });
  }
};


// LOGIN
export const Login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required!"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(400).json({
        message: "Email does not exist!"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Incorrect password!"
      });
    }

    const token = genToken(user._id);

    res.cookie("token", token, {
      ...cookieOptions(),
      maxAge: COOKIE_MAX_AGE
    });

    return res.status(200).json(toSafeUser(user));

  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      message: "Login failed"
    });
  }
};


// LOGOUT
export const logOut = async (req, res) => {
  try {
    res.clearCookie("token", cookieOptions());

    return res.status(200).json({
      message: "Logout successfully"
    });

  } catch (error) {
    console.error("Logout error:", error.message);

    return res.status(500).json({
      message: "Logout failed"
    });
  }
};
