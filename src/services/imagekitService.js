const { getImageKit } = require("../config/imagekit");

/**
 * Upload a file buffer to ImageKit.
 * @param {Buffer} fileBuffer  - file content
 * @param {string} fileName    - desired file name
 * @param {string} folder      - ImageKit folder path e.g. "/consultations"
 * @returns {object} { url, fileId, thumbnailUrl, name }
 */
const uploadFile = async (fileBuffer, fileName, folder = "/uploads") => {
  const ik = getImageKit();
  if (!ik) throw new Error("ImageKit not configured");

  const response = await ik.upload({
    file: fileBuffer,
    fileName,
    folder,
    useUniqueFileName: true,
    tags: ["nbh-health"],
  });

  return {
    url: response.url,
    fileId: response.fileId,
    thumbnailUrl: response.thumbnailUrl || null,
    name: response.name,
    size: response.size,
  };
};

/**
 * Delete a file from ImageKit by fileId.
 */
const deleteFile = async (fileId) => {
  const ik = getImageKit();
  if (!ik) throw new Error("ImageKit not configured");
  return ik.deleteFile(fileId);
};

/**
 * Generate client-side auth parameters for direct browser → ImageKit uploads.
 * Frontend uses these to upload directly without going through our server.
 */
const getAuthParams = () => {
  const ik = getImageKit();
  if (!ik) throw new Error("ImageKit not configured");
  return ik.getAuthenticationParameters();
};

module.exports = { uploadFile, deleteFile, getAuthParams };