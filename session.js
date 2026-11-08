import { authClient } from "./auth-client.js";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "./firestore-client.js";

export const NICKNAME_RULE = "Use 2–30 characters: letters, numbers, spaces, hyphens, or apostrophes.";

export function takeWelcomeFlag() {
  const key = "studygroup_welcome";
  const flag = sessionStorage.getItem(key) === "true";
  if (flag) sessionStorage.removeItem(key);
  return flag;
}

export async function ensureUserProfile(user) {
  const uid = user.uid;
  const userDocRef = doc(null, "users", uid);
  const snapshot = await getDoc(userDocRef);

  if (snapshot.exists()) {
    return snapshot.data();
  }

  const defaultProfile = {
    uid,
    displayName: user.displayName || user.name || user.email?.split("@")[0] || "Learner",
    nickname: user.displayName || user.name || "",
    handle: (user.email?.split("@")[0] || "user").toLowerCase().replace(/[^a-z0-9]/g, ""),
    bio: "",
    boards: {},
    leaderboardOptIn: false,
    xp: 0,
    onboardingComplete: false,
    createdAt: new Date().toISOString()
  };

  await setDoc(userDocRef, defaultProfile);
  sessionStorage.setItem("studygroup_welcome", "true");
  return defaultProfile;
}

export async function saveProfileChoices(profileData, optIn) {
  const sessionResult = await authClient.getSession();
  const authUser = sessionResult.data?.user;
  if (!authUser) throw new Error("No active user session found.");

  const uid = authUser.id || authUser.uid;
  const userDocRef = doc(null, "users", uid);
  const updates = {
    ...profileData,
    leaderboardOptIn: optIn,
    onboardingComplete: true,
    updatedAt: new Date().toISOString()
  };

  await updateDoc(userDocRef, updates);

  if (optIn) {
    const publicRef = doc(null, "publicLeaderboard", uid);
    await setDoc(publicRef, {
      uid,
      displayName: profileData.displayName,
      nickname: profileData.nickname,
      handle: profileData.handle,
      xp: 0,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  }
}
