import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { $, $$, auth, db, getErrorMessage, setFormError, showBanner, showToast } from "./core.js";
import { cleanNickname, validNickname } from "./helpers.js";
import { initLeaderboard, loadLeaderboard } from "./leaderboard.js";
import { initResourceFilter } from "./resources.js";
import { ensureUserProfile, leaderboardReference, NICKNAME_RULE, profileReference } from "./session.js";

const authDialog = $("#auth-dialog");
const authForm = $("#auth-form");

let authMode = "signup";
let registrationInProgress = false;
let redirecting = false;

const providerFactories = {
  google() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return provider;
  }
};

function goToDashboard() {
  if (redirecting) return;
  redirecting = true;
  window.location.replace("dashboard/");
}

function setAuthMode(mode) {
  authMode = mode;
  const signingUp = mode === "signup";
  authForm.reset();
  setFormError($("#auth-error"), "");
  $("#auth-title").textContent = signingUp ? "Find your people." : "Welcome back.";
  $("#auth-intro").textContent = signingUp
    ? "Create your free account and make yourself at home."
    : "Log in to your free StudyGroup account.";
  $("#nickname-field").hidden = !signingUp;
  $("#leaderboard-optin-field").hidden = !signingUp;
  authForm.elements.nickname.required = signingUp;
  authForm.elements.nickname.disabled = !signingUp;
  authForm.elements.password.autocomplete = signingUp ? "new-password" : "current-password";
  $("#auth-submit").innerHTML = signingUp
    ? "Create my free account <span>→</span>"
    : "Log in to StudyGroup <span>→</span>";
  $("#auth-switch-copy").textContent = signingUp ? "Already have an account?" : "New to StudyGroup?";
  $("#auth-switch").textContent = signingUp ? "Log in" : "Join for free";
  $("#forgot-password").hidden = signingUp;
  $$("[data-provider]").forEach((button) => {
    button.querySelector(".social-label").textContent = `${signingUp ? "Sign up" : "Log in"} with Google`;
  });
}

function setSocialBusy(busy) {
  $$("[data-provider]").forEach((button) => {
    button.disabled = busy;
  });
}

async function socialSignIn(providerName) {
  const errorContainer = $("#auth-error");
  setFormError(errorContainer, "");
  setSocialBusy(true);
  const provider = providerFactories[providerName]();
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request") {
      setFormError(errorContainer, "The Google window closed before sign-in finished. Try again and let it close by itself. If it keeps happening, check that this site's address is listed under Authentication, Settings, Authorized domains in the Firebase console.");
      return;
    }
    if (error.code === "auth/popup-blocked" || error.code === "auth/operation-not-supported-in-this-environment") {
      try {
        await signInWithRedirect(auth, provider);
        return;
      } catch (redirectError) {
        console.error("StudyGroup redirect sign-in failed.", redirectError);
        setFormError(errorContainer, getErrorMessage(redirectError));
        return;
      }
    }
    console.error(`StudyGroup ${providerName} sign-in failed.`, error);
    setFormError(errorContainer, getErrorMessage(error));
  } finally {
    setSocialBusy(false);
  }
}

$("#auth-switch").addEventListener("click", () => setAuthMode(authMode === "signup" ? "signin" : "signup"));

$$("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});

$$("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

$$("[data-provider]").forEach((button) => {
  button.addEventListener("click", () => socialSignIn(button.dataset.provider));
});

document.addEventListener("click", (event) => {
  const authButton = event.target.closest("[data-open-auth]");
  if (authButton) {
    setAuthMode(authButton.dataset.openAuth);
    authDialog.showModal();
  }
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = new FormData(authForm);
  const email = String(values.get("email")).trim();
  const password = String(values.get("password"));
  const submitButton = $("#auth-submit");
  const errorContainer = $("#auth-error");
  setFormError(errorContainer, "");
  submitButton.disabled = true;
  submitButton.textContent = authMode === "signup" ? "Making your study space…" : "Signing you in…";

  try {
    if (authMode === "signin") {
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      const displayName = cleanNickname(String(values.get("nickname") || ""));
      if (!validNickname(displayName)) {
        setFormError(errorContainer, NICKNAME_RULE);
        return;
      }
      registrationInProgress = true;
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const optIn = values.get("leaderboardOptIn") === "on";
      const batch = writeBatch(db);
      batch.set(profileReference(credential.user), {
        displayName,
        leaderboardOptIn: optIn,
        createdAt: serverTimestamp()
      });
      if (optIn) {
        batch.set(leaderboardReference(credential.user.uid), {
          displayName,
          points: 0,
          lastPointAt: null,
          joinedAt: serverTimestamp()
        });
      }
      await batch.commit();
      registrationInProgress = false;
      goToDashboard();
    }
  } catch (error) {
    console.error(`StudyGroup ${authMode} failed.`, error);
    registrationInProgress = false;
    if (authMode === "signup" && auth.currentUser) {
      try {
        await ensureUserProfile(auth.currentUser);
        goToDashboard();
        return;
      } catch (profileError) {
        console.error("The account was created but the StudyGroup profile could not be saved.", profileError);
        setFormError(errorContainer, `Your account was created, but the StudyGroup profile could not be saved. ${getErrorMessage(profileError)}`);
      }
    }
    if (!errorContainer.textContent) setFormError(errorContainer, getErrorMessage(error));
  } finally {
    registrationInProgress = false;
    submitButton.disabled = false;
    submitButton.innerHTML = authMode === "signup"
      ? "Create my free account <span>→</span>"
      : "Log in to StudyGroup <span>→</span>";
  }
});

$("#forgot-password").addEventListener("click", async () => {
  const email = String(authForm.elements.email.value).trim();
  const errorContainer = $("#auth-error");
  if (!email) {
    setFormError(errorContainer, "Enter your email address first, and then choose Forgot your password?");
    authForm.elements.email.focus();
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    setFormError(errorContainer, "");
    showToast("If an account exists for that email, a password reset link is on its way.");
  } catch (error) {
    console.error("StudyGroup password reset failed.", error);
    setFormError(errorContainer, getErrorMessage(error));
  }
});

initResourceFilter();
initLeaderboard();

if (window.location.protocol === "file:") {
  showBanner("Open StudyGroup through Firebase Hosting or a local web server. Sign-in does not work from a file.", true);
}

onAuthStateChanged(auth, async (user) => {
  if (registrationInProgress || !user) return;
  try {
    await ensureUserProfile(user);
    goToDashboard();
  } catch (error) {
    console.error("Could not load the student's private StudyGroup profile.", error);
    setFormError($("#auth-error"), getErrorMessage(error));
    showBanner(getErrorMessage(error), true);
  }
});

getRedirectResult(auth).catch((error) => {
  console.error("StudyGroup redirect sign-in failed.", error);
  showBanner(getErrorMessage(error), true);
});

loadLeaderboard();
