/**
 * medicineImageService.js
 *
 * Fetches a medicine image URL using Google Custom Search API,
 * then stores it in ImageKit for persistent hosting.
 *
 * Requires in .env:
 *   GOOGLE_API_KEY=
 *   GOOGLE_SEARCH_ENGINE_ID=
 */

const axios = require("axios");
const Medicine = require("../models/Medicine");
const { uploadFile } = require("./imagekitService");

/**
 * Search Google Images for a medicine photo.
 * Returns the first result image URL or null.
 *
 * @param {string} medicineName  e.g. "Paracetamol"
 * @returns {string|null}  direct image URL
 */
const searchGoogleImage = async (medicineName) => {
    if (!process.env.GOOGLE_API_KEY || !process.env.GOOGLE_SEARCH_ENGINE_ID) {
        console.warn("⚠️  GOOGLE_API_KEY or GOOGLE_SEARCH_ENGINE_ID not set — image search skipped");
        return null;
    }

    try {
        const query = `${medicineName} tablet medicine 500mg`;

        const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
            params: {
                q: query,
                searchType: "image",
                key: process.env.GOOGLE_API_KEY,
                cx: process.env.GOOGLE_SEARCH_ENGINE_ID,
                num: 5,             // fetch 5 candidates
                imgSize: "medium",  // medium quality is fine
                safe: "active",
            },
            timeout: 8000,
        });

        const items = response.data?.items;
        if (!items || items.length === 0) return null;

        // Prefer items with "tablet" or "medicine" in link/title
        const preferred = items.find(
            (i) =>
                i.link?.includes("tablet") ||
                i.title?.toLowerCase().includes("tablet") ||
                i.title?.toLowerCase().includes("medicine")
        );

        return (preferred || items[0]).link;
    } catch (err) {
        console.error(`Google image search failed for "${medicineName}":`, err.message);
        return null;
    }
};

/**
 * Fetch a remote image and upload it to ImageKit.
 * Returns { url, fileId, thumbnailUrl } or null on failure.
 *
 * @param {string} imageUrl   - remote URL to fetch
 * @param {string} fileName   - desired filename in ImageKit
 */
const uploadRemoteImageToImageKit = async (imageUrl, fileName) => {
    try {
        // Download image as buffer
        const response = await axios.get(imageUrl, {
            responseType: "arraybuffer",
            timeout: 10000,
            headers: {
                // Pretend to be a browser to avoid 403s from some hosts
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
            },
        });

        const buffer = Buffer.from(response.data);
        const contentType = response.headers["content-type"] || "image/jpeg";

        // Only allow images
        if (!contentType.startsWith("image/")) {
            console.warn("Skipping non-image content-type:", contentType);
            return null;
        }

        return await uploadFile(buffer, fileName, "/medicines");
    } catch (err) {
        console.error("uploadRemoteImageToImageKit failed:", err.message);
        return null;
    }
};

/**
 * Main function: given a medicine name, find its image via Google,
 * upload it to ImageKit, and save the URL to the Medicine document.
 *
 * @param {string} medicineName  - lowercase medicine name (matches Medicine.name)
 * @returns {object}  updated Medicine doc or error info
 */
const fetchAndStoreMedicineImage = async (medicineName) => {
    const medicine = await Medicine.findOne({ name: medicineName.toLowerCase() });
    if (!medicine) {
        return { success: false, message: `Medicine "${medicineName}" not found in DB` };
    }

    // Already has an image from ImageKit? Skip unless forced
    if (medicine.imageUrl && medicine.imageUrl.includes("ik.imagekit.io")) {
        return { success: true, message: "Already has ImageKit image", medicine };
    }

    // Step 1: Google search
    const googleImageUrl = await searchGoogleImage(medicine.displayName || medicineName);
    if (!googleImageUrl) {
        return { success: false, message: "No image found via Google Search" };
    }

    // Step 2: Upload to ImageKit
    const fileName = `${medicineName.replace(/\s+/g, "_")}_${Date.now()}.jpg`;
    const ikResult = await uploadRemoteImageToImageKit(googleImageUrl, fileName);

    if (!ikResult) {
        // Fallback: store the Google URL directly (less reliable but better than nothing)
        await Medicine.findByIdAndUpdate(medicine._id, {
            imageUrl: googleImageUrl,
            lastVerifiedAt: new Date(),
        });
        return { success: true, message: "Stored Google URL directly (ImageKit upload failed)", medicine };
    }

    // Step 3: Save to DB
    const updated = await Medicine.findByIdAndUpdate(
        medicine._id,
        {
            imageUrl: ikResult.url,
            imageFileId: ikResult.fileId,
            thumbnailUrl: ikResult.thumbnailUrl || ikResult.url,
            lastVerifiedAt: new Date(),
        },
        { new: true }
    );

    return { success: true, medicine: updated, imageUrl: ikResult.url };
};

/**
 * Bulk fetch images for all medicines that don't have one yet.
 * Runs sequentially to avoid hammering Google API quota.
 *
 * @returns {Array} results array
 */
const bulkFetchMedicineImages = async () => {
    const medicines = await Medicine.find({
        isActive: true,
        $or: [{ imageUrl: null }, { imageUrl: "" }, { imageUrl: { $exists: false } }],
    }).select("name displayName");

    const results = [];
    for (const med of medicines) {
        // Small delay between requests to respect API rate limits
        await new Promise((r) => setTimeout(r, 500));
        const result = await fetchAndStoreMedicineImage(med.name);
        results.push({ name: med.name, ...result });
        console.log(`  Image fetch [${med.name}]:`, result.success ? "✅" : "❌", result.message || "");
    }

    return results;
};

module.exports = {
    fetchAndStoreMedicineImage,
    bulkFetchMedicineImages,
    searchGoogleImage,
};