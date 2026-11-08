import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBjDf2CpgkOAyzJ-eu_dQOCAKc-fI2VpXk",
  authDomain: "aurevion-auth-7b9eb.firebaseapp.com",
  projectId: "aurevion-auth-7b9eb",
  storageBucket: "aurevion-auth-7b9eb.firebasestorage.app",
  messagingSenderId: "636144911156",
  appId: "1:636144911156:web:be5891a3649c9d3e959b61",
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
