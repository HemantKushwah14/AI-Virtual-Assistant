
import mongoose from "mongoose";

const connectDb = async () => {
    try {
        const mongoUrl = process.env.MONGODB_URI;

        if (!mongoUrl) {
            throw new Error("MONGODB_URI is missing in .env");
        }

        await mongoose.connect(mongoUrl, {
            serverSelectionTimeoutMS: 15000
        });

        console.log("MongoDB connected successfully");

    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        throw error;
    }
};

export default connectDb;
