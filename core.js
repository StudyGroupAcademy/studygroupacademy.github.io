import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { SUBJECTS } from "./helpers.js";

const firebaseConfig = {
  apiKey: "AIzaSyDngXDhTtE0tV6wq85Bn-8YSOsPGYNEr1A",
  authDomain: "studygroup-b5135.firebaseapp.com",
  projectId: "studygroup-b5135",
  storageBucket: "studygroup-b5135.firebasestorage.app",
  messagingSenderId: "393655925246",
  appId: "1:393655925246:web:65efa6890b69b23a3ba8af",
  measurementId: "G-B25FWYEXN6"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const state = { user: null, profile: null };

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

let toastTimer;

export function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3800);
}

export function showBanner(message, error = false) {
  const banner = $("#firebase-banner");
  banner.textContent = message;
  banner.classList.toggle("is-error", error);
  banner.classList.add("visible");
  window.clearTimeout(banner.hideTimer);
  if (!error) {
    banner.hideTimer = window.setTimeout(() => banner.classList.remove("visible"), 3400);
  }
}

export function setFormError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

export async function runSafely(task, button) {
  if (button) button.disabled = true;
  try {
    await task();
  } catch (error) {
    console.error("StudyGroup action failed.", error);
    showToast(getErrorMessage(error));
  } finally {
    if (button) button.disabled = false;
  }
}

export function fillSubjectSelects() {
  $$("select[data-subjects]").forEach((select) => {
    select.innerHTML = SUBJECTS.map((subject) => `<option value="${subject}">${subject}</option>`).join("");
  });
}

export function getErrorMessage(error) {
  const messages = {
    "auth/configuration-not-found": "Sign-in is not switched on for this Firebase project yet. In the Firebase console open Authentication, press Get started, then enable Email/Password and Google under Sign-in method.",
    "auth/email-already-in-use": "There's already an account with that email. Try logging in instead.",
    "auth/invalid-email": "That email address doesn't look right. Check it and try again.",
    "auth/invalid-credential": "We couldn't sign you in with those details. Double-check your email and password.",
    "auth/wrong-password": "We couldn't sign you in with those details. Double-check your email and password.",
    "auth/user-not-found": "We couldn't sign you in with those details. Double-check your email and password.",
    "auth/user-disabled": "This account is currently disabled. Please contact StudyGroup support.",
    "auth/weak-password": "Choose a stronger password with at least six characters.",
    "auth/too-many-requests": "Too many attempts. Take a little break and try again later.",
    "auth/network-request-failed": "We couldn't reach Firebase. Check your internet connection and try again.",
    "auth/operation-not-allowed": "That sign-in method is not enabled yet. Turn it on under Authentication, Sign-in method in the Firebase console.",
    "auth/unauthorized-domain": "This website address is not an authorized domain. Add it under Authentication, Settings, Authorized domains in the Firebase console.",
    "auth/popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.",
    "auth/account-exists-with-different-credential": "An account with that email already exists using a different sign-in method. Log in with the method you used first.",
    "auth/invalid-api-key": "The Firebase API key in this site is not valid. Check the Firebase configuration in core.js.",
    "auth/api-key-not-valid": "The Firebase API key in this site is not valid. Check the Firebase configuration in core.js.",
    "auth/web-storage-unsupported": "Your browser is blocking storage that sign-in needs. Turn off private mode or allow cookies and try again.",
    "auth/internal-error": "Firebase hit an internal error. Check that sign-in providers are fully set up, then try again.",
    "auth/requires-recent-login": "For your security, please log out and log in again, then retry.",
    "permission-denied": "Firebase blocked this action. Check that the latest Firestore security rules have been deployed.",
    "unavailable": "We couldn't reach the database. Check your connection, and make sure a Firestore database has been created in the Firebase console (Build, Firestore Database, Create database). Then try again.",
    "resource-exhausted": "The free Firebase quota has been used up for now. Try again later.",
    "failed-precondition": "Firestore needs an index or setup step for this action. Check the browser console for the link.",
    "not-found": "That item could not be found. It may have been deleted."
  };
  return messages[error?.code] || `Something went wrong: ${error?.message || "please try again."}`;
}
