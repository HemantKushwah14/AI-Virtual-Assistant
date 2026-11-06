import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

const removeLocalFile = (filePath) => {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        console.error("Could not delete temp file:", error.message);
    }
};

const uploadOnCloudinary = async (filePath) => {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        // .env uses CLOUDINARY_SECRET_KEY; accept either name
        api_secret:
            process.env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_SECRET_KEY
    });

    try {
        const uploadResult = await cloudinary.uploader.upload(filePath);
        return uploadResult.secure_url;
    } catch (error) {
        console.error("Cloudinary upload error:", error.message);
        throw new Error("Cloudinary upload failed");
    } finally {
        removeLocalFile(filePath);
    }
};

export default uploadOnCloudinary;
