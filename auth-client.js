import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  sendEmailVerification,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  linkWithPopup,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDngXDhTtE0tV6wq85Bn-8YSOsPGYNEr1A",
  authDomain: "studygroup-b5135.firebaseapp.com",
  projectId: "studygroup-b5135",
  storageBucket: "studygroup-b5135.firebasestorage.app",
  messagingSenderId: "393655925246",
  appId: "1:393655925246:web:65efa6890b69b23a3ba8af",
  measurementId: "G-B25FWYEXN6"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

let initialAuthReady;
function waitForInitialAuth() {
  if (!initialAuthReady) {
    initialAuthReady = new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      }, reject);
    });
  }
  return initialAuthReady;
}

function normalizeUser(user) {
  if (!user) return null;
  return {
    id: user.uid,
    uid: user.uid,
    email: user.email || "",
    name: user.displayName || user.email?.split("@")[0] || "Learner",
    displayName: user.displayName || "",
    emailVerified: Boolean(user.emailVerified),
    photoURL: user.photoURL || "",
    metadata: { creationTime: user.metadata?.creationTime || "" },
    user_metadata: { name: user.displayName || "" },
    firebaseUser: user
  };
}

export async function getCurrentSession() {
  await waitForInitialAuth();
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) return { data: { user: null }, user: null, error: null };
  const token = await firebaseUser.getIdToken();
  const identityResponse = await fetch("https://studygroupacademy-github-io.onrender.com/api/identity", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  const identity = await identityResponse.json().catch(() => ({}));
  if (!identityResponse.ok) throw new Error(identity.error || "Your sign-in could not be verified by StudyGroup.");
  const user = { ...normalizeUser(firebaseUser), id: identity.uid, uid: identity.uid, firebaseUid: firebaseUser.uid };
  return { data: { user }, user, error: null };
}

export function getSessionUser(result) {
  return result?.user || result?.data?.user || null;
}

export function getSessionRecord(result) {
  const user = getSessionUser(result);
  return user ? { user } : null;
}

export function normalizeSessionResult(result) {
  return { user: getSessionUser(result), session: getSessionRecord(result), error: result?.error || null };
}

export async function getAuthToken() {
  await waitForInitialAuth();
  if (!auth.currentUser) return null;
  return auth.currentUser.getIdToken();
}

export const authClient = {
  signUp: {
    email: async ({ name, email, password }) => {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      if (name) await updateProfile(credential.user, { displayName: name });
      await sendEmailVerification(credential.user);
      return { data: { user: normalizeUser(credential.user) }, error: null };
    }
  },
  signIn: {
    email: async ({ email, password }) => {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      return { data: { user: normalizeUser(credential.user) }, error: null };
    },
    social: async ({ provider }) => {
      if (provider !== "google") throw new Error("Only Google sign-in is configured.");
      const credential = await signInWithPopup(auth, googleProvider);
      return { data: { user: normalizeUser(credential.user) }, error: null };
    }
  },
  signOut: async () => {
    await signOut(auth);
    return { error: null };
  },
  requestPasswordReset: async ({ email }) => {
    await sendPasswordResetEmail(auth, email);
    return { error: null };
  },
  linkSocial: async ({ provider }) => {
    if (provider !== "google") throw new Error("Only Google account linking is configured.");
    if (!auth.currentUser) throw new Error("Sign in before linking Google.");
    return linkWithPopup(auth.currentUser, googleProvider);
  },
  token: getAuthToken
};
