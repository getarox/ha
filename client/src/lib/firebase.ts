import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDDBdKx7uFBpGLil7vT5jYj9p420OpSC6w",
  authDomain: "aurevion-auth.firebaseapp.com",
  projectId: "aurevion-auth",
  storageBucket: "aurevion-auth.firebasestorage.app",
  messagingSenderId: "988565270032",
  appId: "1:988565270032:web:56063a428d0db309e4e495",
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
