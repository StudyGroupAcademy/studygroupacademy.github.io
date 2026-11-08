import { authClient, getAuthToken, getCurrentSession, getSessionUser, normalizeSessionResult } from "./auth-client.js";
import { $, $$, db, getErrorMessage, setFormError, showBanner, showToast } from "./core.js";
import { doc, serverTimestamp, setDoc, syncLeaderboardXp } from "./firestore-client.js";
import { cleanNickname, consumeOAuthCallback, describeOAuthError, validNickname } from "./helpers.js";
import { ensureUserProfile } from "./session.js";
import { initLeaderboard, loadLeaderboard } from "./leaderboard.js";
import { initResourceFilter } from "./resources.js";
import { schoolRequest } from "./school-client.js";

const authDialog = $("#auth-dialog");
const authForm = $("#auth-form");
const authAccount = $("#auth-account");
const homeworkForm = $("#homework-form");
const schoolApplicationDialog = $("#school-application-dialog");
const schoolApplicationForm = $("#school-application-form");

let authMode = "signup";

function setAuthMode(mode) {
  authMode = mode;
  const signingUp = mode === "signup";
  authForm.reset();
  setFormError($("#auth-error"), "");
  $("#auth-title").textContent = signingUp ? "Find your people." : "Welcome back.";
  $("#auth-intro").textContent = signingUp
    ? new URLSearchParams(window.location.search).has("invite")
      ? "Create or log in to the account invited by your school."
      : "Create your personal StudyGroup learner account."
    : "Log in to your free StudyGroup account.";
  authForm.elements.password.autocomplete = signingUp ? "new-password" : "current-password";
  const nameLabel = $("#signup-name-label");
  if (nameLabel) nameLabel.hidden = !signingUp;
  authForm.elements.displayName.required = signingUp;
  $("#auth-submit").innerHTML = signingUp
    ? "Create my free account <span>→</span>"
    : "Log in to StudyGroup <span>→</span>";
  $("#auth-switch-copy").textContent = signingUp ? "Already have an account?" : "New to StudyGroup?";
  $("#auth-switch").textContent = signingUp ? "Log in" : "Join for free";
  $("#auth-google-label").textContent = signingUp ? "Continue with Google" : "Sign in with Google";
  $("#forgot-password").hidden = signingUp;
}

async function socialSignIn(providerName) {
  const errorContainer = $("#auth-error");
  setFormError(errorContainer, "");
  try {
    const callbackURL = new URL("/dashboard/", window.location.origin);
    const invite = new URLSearchParams(window.location.search).get("invite");
    if (invite) callbackURL.searchParams.set("invite", invite);
    const result = await authClient.signIn.social({
      provider: providerName,
      callbackURL: callbackURL.toString()
    });
    if (result?.error) throw result.error;
    const redirectUrl = result?.data?.url || result?.url;
    window.location.assign(redirectUrl || callbackURL.toString());
  } catch (error) {
    console.error(`StudyGroup ${providerName} sign-in failed.`, error);
    setFormError(errorContainer, error.message || "Sign-in could not be completed. Please try again.");
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
  submitButton.textContent = authMode === "signup" ? "Creating your account…" : "Signing you in…";

  let accountCreated = false;
  const inviteToken = new URLSearchParams(window.location.search).get("invite");
  try {
    let displayName = "";
    const callbackURL = new URL("/dashboard/", window.location.origin);
    if (inviteToken) callbackURL.searchParams.set("invite", inviteToken);
    if (authMode === "signup") {
      displayName = cleanNickname(String(values.get("displayName") || "").trim()).replace(/[^A-Za-z0-9 _.-]/g, "").slice(0, 60);
      if (displayName.length < 2) throw new Error("Please enter a name with at least 2 characters.");
      const result = await authClient.signUp.email({ name: displayName, email, password, callbackURL: callbackURL.toString() });
      if (result.error) throw result.error;
      accountCreated = true;
      showToast("Account created. Check your inbox to verify your email. You can continue once verification is complete.");
    } else {
      const result = await authClient.signIn.email({ email, password });
      if (result?.error) throw result.error;
    }
    const session = await refreshAuthState({ loadProfile: authMode !== "signup", retries: 5 });
    if (authMode === "signup" && session?.user?.id) {
      await setDoc(doc(db, "users", session.user.id), {
        email: session.user.email || email,
        displayName,
        nickname: displayName,
        handle: `${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 15) || "learner"}_${session.user.id.slice(-4)}`,
        bio: "",
        badge: "Learner",
        boards: {},
        onboardingComplete: false,
        leaderboardOptIn: false,
        createdAt: serverTimestamp()
      });
      try {
        sessionStorage.setItem("studygroup-welcome", "1");
      } catch (storageError) {
        console.error("The profile setup reminder could not be stored.", storageError);
      }
    }
    if (!session?.user?.id) {
      throw new Error("Firebase could not confirm your sign-in. Please check the Firebase Authentication settings and try again.");
    }
    window.location.assign(callbackURL.toString());
  } catch (error) {
    console.error(`StudyGroup ${authMode} failed.`, error);
    setFormError(
      errorContainer,
      accountCreated
        ? "Your account was created, but we couldn't finish saving your profile. Log in with your new account to continue."
        : error.message || getErrorMessage(error)
    );
  } finally {
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
    const result = await authClient.requestPasswordReset({
      email,
      continueUrl: `${window.location.origin}${window.location.pathname}`
    });
    if (result.error) throw result.error;
    setFormError(errorContainer, "");
    showToast("If an account exists for that email, a password reset message is on its way.");
  } catch (error) {
    console.error("StudyGroup password reset failed.", error);
    setFormError(errorContainer, error.message || getErrorMessage(error));
  }
});

initResourceFilter();
initLeaderboard();

$("#open-school-application").addEventListener("click", () => {
  schoolApplicationForm.reset();
  setFormError($("#school-application-error"), "");
  schoolApplicationDialog.showModal();
});

schoolApplicationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#school-application-submit");
  const error = $("#school-application-error");
  const result = $("#school-application-result");
  setFormError(error, "");
  button.disabled = true;
  button.textContent = "Sending application…";
  try {
    await schoolRequest("apply", Object.fromEntries(new FormData(schoolApplicationForm).entries()), { anonymous: true });
    schoolApplicationDialog.close();
    schoolApplicationForm.reset();
    result.textContent = "Application sent. The StudyGroup administrator will review your school details.";
  } catch (caught) {
    console.error("Could not submit the school application.", caught);
    setFormError(error, caught.message || "The school application could not be submitted.");
  } finally {
    button.disabled = false;
    button.textContent = "Send application";
  }
});

const authCallback = consumeOAuthCallback();
if (authCallback.error) {
  setAuthMode("signin");
  setFormError($("#auth-error"), describeOAuthError(authCallback.error));
  authDialog.showModal();
}

if (window.location.protocol === "file:") {
  showBanner("Open StudyGroup through a web server. Sign-in does not work from a file.", true);
}

function renderAuthState(user, profile = null) {
  authAccount.hidden = !user;
  $$("[data-open-auth]").forEach((button) => {
    button.hidden = Boolean(user);
  });
  const isPlaceholder = (value) => !value || ["learner", "student", "user"].includes(String(value).trim().toLowerCase());
  const accountName = [profile?.displayName, profile?.nickname, user?.name].find((value) => !isPlaceholder(value)) || "";
  $("#auth-account-name").textContent = accountName;
  $("#auth-dashboard-link").hidden = true;
}

async function refreshAuthState({ loadProfile = true, retries = 0 } = {}) {
  const result = await getCurrentSession({ retries, retryDelay: 300 });
  const sessionData = normalizeSessionResult(result);
  const user = getSessionUser(result);
  let profile = null;
  if (user && loadProfile) {
    try {
      profile = await ensureUserProfile(user);
      if (profile?.leaderboardOptIn) {
        try {
          await syncLeaderboardXp();
          await loadLeaderboard();
        } catch (error) { console.warn("The public leaderboard could not be synchronised yet.", error); }
      }
    } catch (error) { console.warn("The signed-in account profile could not be loaded.", error); }
  }
  renderAuthState(user, profile);
  return sessionData;
}

$("#auth-sign-out").addEventListener("click", async () => {
  try {
    const result = await authClient.signOut();
    if (result?.error) throw result.error;
    const sessionResult = await getCurrentSession();
    if (getSessionUser(sessionResult)) throw new Error("Your session is still active. Please try logging out again.");
    renderAuthState(null);
    showToast("You have been signed out.");
  } catch (error) {
    console.error("Could not sign out of StudyGroup.", error);
    showToast(error.message || "Sign-out could not be completed.");
  }
});

async function uploadHomework(file) {
  const token = await getAuthToken();
  if (!token) throw new Error("Your sign-in session could not be confirmed. Please sign out and log in again.");

  const signatureResponse = await fetch("https://studygroupacademy-github-io.onrender.com/api/cloudinary/signature", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  const signatureResult = await signatureResponse.json();
  if (!signatureResponse.ok) {
    throw new Error(signatureResult.error || "The secure upload service could not authorize this file.");
  }

  const uploadData = new FormData();
  uploadData.append("file", file);
  uploadData.append("api_key", signatureResult.apiKey);
  uploadData.append("signature", signatureResult.signature);
  for (const [key, value] of Object.entries(signatureResult.params)) {
    uploadData.append(key, String(value));
  }

  const uploadResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(signatureResult.cloudName)}/${signatureResult.resourceType}/upload`,
    { method: "POST", body: uploadData }
  );
  const uploadResult = await uploadResponse.json();
  if (!uploadResponse.ok) {
    throw new Error(uploadResult.error?.message || "Cloudinary could not store this file.");
  }
}

if (homeworkForm) homeworkForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = homeworkForm.elements.file.files[0];
  const status = $("#homework-upload-status");
  const button = $("#homework-upload-submit");
  if (!file) {
    status.textContent = "Choose a file first.";
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    status.textContent = "Files must be 10 MB or smaller.";
    return;
  }

  button.disabled = true;
  status.textContent = "Uploading securely…";
  try {
    await uploadHomework(file);
    homeworkForm.reset();
    status.textContent = "Upload complete. The file is private in Cloudinary; assignment records and sharing are not connected yet.";
  } catch (error) {
    console.error("StudyGroup homework upload failed.", error);
    status.textContent = error.message || "The file could not be uploaded.";
  } finally {
    button.disabled = false;
  }
});

const profileQuery = window.location.search.slice(1).split("&")[0];
const profileQueryKey = (() => {
  try { return decodeURIComponent(profileQuery.split("=")[0] || "").replace(/^@/, "").toLowerCase(); }
  catch { return ""; }
})();
const reservedQueryKeys = new Set(["", "invite", "oauth", "error", "utm_source", "utm_medium", "utm_campaign"]);
const pathProfileKey = (() => {
  try { return decodeURIComponent(window.location.pathname.replace(/^\/+|\/+$/g, "")).replace(/^@/, "").toLowerCase(); }
  catch { return ""; }
})();
const isPublicProfileRoute = [profileQueryKey, pathProfileKey].some((key) => /^[a-z0-9_]{3,20}$/.test(key) && !reservedQueryKeys.has(key));

refreshAuthState({ retries: 2 }).then((session) => {
  if (session?.user && !isPublicProfileRoute) {
    const dashboard = new URL("dashboard/", document.baseURI);
    const invite = new URLSearchParams(window.location.search).get("invite");
    if (invite) dashboard.searchParams.set("invite", invite);
    window.location.replace(dashboard.toString());
  }
}).catch((error) => {
  console.error("Could not restore the Firebase Authentication session.", error);
  renderAuthState(null);
  showBanner("We couldn't check your sign-in. Please refresh the page and try again.", true);
});

loadLeaderboard();
