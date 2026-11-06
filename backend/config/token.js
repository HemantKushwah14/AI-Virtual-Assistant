import jwt from "jsonwebtoken";

const genToken = (userId) => {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is missing in .env");
    }
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "10d" });
};

// Cookie options shared by signup / login / logout.
// SameSite=None + Secure is required when frontend and backend are on
// different domains (e.g. Render). On localhost, Lax works and avoids
// browsers rejecting the cookie over plain http.
export const cookieOptions = () => {
    const isProduction = process.env.NODE_ENV === "production";
    return {
        httpOnly: true,
        sameSite: isProduction ? "None" : "Lax",
        secure: isProduction
    };
};

export default genToken;
