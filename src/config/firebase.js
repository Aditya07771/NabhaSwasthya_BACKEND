const admin = require("firebase-admin");

let firebaseApp;

const initFirebase = () => {
  if (firebaseApp) return firebaseApp;

  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_CLIENT_EMAIL) {
    console.warn("⚠️  Firebase env vars missing — OAuth login will not work.");
    return null;
  }

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
    console.log("✅  Firebase Admin SDK initialised");
  } catch (err) {
    console.error("❌  Firebase init error:", err.message);
  }

  return firebaseApp;
};

const verifyFirebaseToken = async (idToken) => {
  const app = initFirebase();
  if (!app) throw new Error("Firebase not initialised");
  return admin.auth().verifyIdToken(idToken);
};

module.exports = { initFirebase, verifyFirebaseToken };