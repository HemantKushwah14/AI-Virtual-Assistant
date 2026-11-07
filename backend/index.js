import "dotenv/config";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import connectDb from "./config/db.js";

import authRouter from "./routes/auth.routes.js";
import userRouter from "./routes/user.routes.js";

const app = express();

// Middleware
app.use(express.json({ limit: "10mb" })); // voice clips are sent as base64
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
    cors({
        origin: [
            "http://localhost:5173",
            "https://ai-virtual-assistant-frontend-o0ei.onrender.com",
            // your deployed frontend URL(s), comma separated, set on the hosting site
            ...(process.env.FRONTEND_URL || "").split(",").map((u) => u.trim()).filter(Boolean)
        ],
        credentials: true
    })
);

// Health check
app.get("/api/health", (req, res) => {
    res.status(200).send("Server Running");
});

// Routes
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);

// Serve the built frontend (frontend/dist) from this same server in production.
// One site = login cookies work in every browser, no CORS problems.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.join(__dirname, "..", "frontend", "dist");

if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    // React Router: any other GET page -> index.html
    app.use((req, res, next) => {
        if (req.method !== "GET" || req.path.startsWith("/api")) return next();
        res.sendFile(path.join(frontendDist, "index.html"));
    });
} else {
    app.get("/", (req, res) => res.status(200).send("Server Running"));
}

// Error handler (multer errors, bad JSON, etc.)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err.message);
    res.status(err.status || 400).json({ message: err.message || "Server error" });
});

// Server startup
const PORT = process.env.PORT || 8000;

const startServer = async () => {
    try {
        await connectDb();

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }
};

startServer();
