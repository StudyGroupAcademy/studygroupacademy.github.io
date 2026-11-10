import { SUBJECTS } from "./helpers.js";

export const db = Object.freeze({});
export const state = { user: null, profile: null };

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

let toastTimer;

export function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3800);
}

export function showBanner(message, error = false) {
  const banner = $("#status-banner") || $("#firebase-banner");
  if (!banner) return;
  banner.textContent = message;
  banner.classList.toggle("is-error", error);
  banner.classList.add("visible");
  window.clearTimeout(banner.hideTimer);
  if (!error) {
    banner.hideTimer = window.setTimeout(() => banner.classList.remove("visible"), 3400);
  }
}

export function setFormError(element, message) {
  if (!element) return;
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
  const code = String(error?.code || "").toLowerCase().replace(/^auth\//, "");
  const message = String(error?.message || "");
  const firebase = {
    "invalid-email": "That email address doesn't look right. Check it and try again.",
    "user-not-found": "We couldn't find an account with that email. Check the address or create a free account.",
    "wrong-password": "That password doesn't match this account. Try again or reset your password.",
    "invalid-credential": "Those sign-in details don't match. Check your email and password.",
    "invalid-login-credentials": "Those sign-in details don't match. Check your email and password.",
    "user-disabled": "This account is currently disabled. Contact the StudyGroup team if you think this is a mistake.",
    "credential-already-in-use": "That sign-in method is already connected to another account. Log in to that account instead.",
    "requires-recent-login": "For your security, sign in again before making this change.",
    "invalid_credentials": "Those sign-in details don't match. Check your email and password.",
    "email-already-in-use": "An account already uses that email. Try logging in instead.",
    "user-already-exists": "An account already uses that email. Try logging in instead.",
    "weak-password": "Choose a stronger password with at least 8 characters.",
    "too-many-requests": "There have been too many attempts. Wait a little while, then try again.",
    "network-request-failed": "We couldn't connect to the sign-in service. Check your internet connection and try again.",
    "popup-closed-by-user": "The sign-in window was closed before it finished. You can try again whenever you're ready.",
    "popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.",
    "account-exists-with-different-credential": "That email already has an account using another sign-in method. Log in with that method first.",
    "requires-recent-login": "For your security, sign in again before making this change.",
    "operation-not-allowed": "This sign-in method isn't enabled yet. Please use another available method.",
    "permission-denied": "You don't have permission to do that. Check that you're signed into the right account.",
    "unauthorized-domain": "This website address isn't enabled for sign-in yet. The site administrator needs to add it to Firebase's authorised domains.",
    "quota-exceeded": "The service has reached a usage limit. Please try again later.",
    "internal": "The service had a problem. Please try again in a moment."
  };
  if (firebase[code]) return firebase[code];
  if (/could not reach its Render API|Failed to fetch|NetworkError|fetch failed/i.test(message)) return "We couldn't reach StudyGroup's server. It may be waking up or temporarily unavailable. Wait a moment and try again.";
  if (/returned an unreadable response/i.test(message)) return "StudyGroup's server sent an unexpected response. Please try again; if it keeps happening, contact the team.";
  if (/database request failed/i.test(message)) return "We couldn't save your changes right now. Your connection or the StudyGroup data service may be temporarily unavailable.";
  if (/Firebase could not confirm/i.test(message)) return "Your account was created, but we couldn't finish signing you in. Try logging in again in a moment.";
  if (error?.status === 401 || /valid Firebase sign-in is required/i.test(message)) return "Your sign-in has expired. Log in again, then retry that action.";
  if (error?.status === 403) return "This action isn't available for your account. Check your access or ask your school administrator.";
  if (error?.status >= 500) return "StudyGroup's server is having a temporary problem. Please try again shortly.";
  if (code.startsWith("auth/")) return "We couldn't complete that account action. Check your details and try again.";
  if (error instanceof TypeError) return "Something couldn't connect. Check your internet connection and try again.";
  return message && !/firebase|render|neon|postgres|http\s*\d{3}|stack|exception/i.test(message) ? message : "Something went wrong. Please try again. If it keeps happening, contact the StudyGroup team.";
}
