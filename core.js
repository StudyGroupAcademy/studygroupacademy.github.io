import { SUBJECTS } from "./helpers.js";

export const db = Object.freeze({});
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
  const banner = $("#status-banner") || $("#firebase-banner");
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
  if (error?.code === "invalid_credentials") {
    return "Those sign-in details didn't match an account. Check your email and password.";
  }
  if (error?.code === "USER_ALREADY_EXISTS") {
    return "There's already an account with that email. Try logging in instead.";
  }
  return error?.message || "Something went wrong. Please try again.";
}
