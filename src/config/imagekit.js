const ImageKit = require("imagekit");

let imagekitInstance = null;

const getImageKit = () => {
  if (imagekitInstance) return imagekitInstance;

  if (!process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_PRIVATE_KEY || !process.env.IMAGEKIT_URL_ENDPOINT) {
    console.warn("⚠️  ImageKit env vars missing — file uploads will not work.");
    return null;
  }

  imagekitInstance = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
  });

  console.log("✅  ImageKit initialised");
  return imagekitInstance;
};

module.exports = { getImageKit };