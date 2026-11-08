import { getCurrentSession, getSessionUser } from "./auth-client.js";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "./firestore-client.js";

export const NICKNAME_RULE = "Use 2–30 characters: letters, numbers, spaces, hyphens, or apostrophes.";

export function takeWelcomeFlag() {
  let flag = false;
  try {
    flag = sessionStorage.getItem("studygroup_welcome") === "true"
      || sessionStorage.getItem("studygroup-welcome") === "1";
    sessionStorage.removeItem("studygroup_welcome");
    sessionStorage.removeItem("studygroup-welcome");
  } catch (error) {
    console.warn("Welcome state is unavailable.", error);
  }
  return flag;
}

export async function ensureUserProfile(user) {
  const uid = user?.id || user?.uid;
  if (!uid) throw new Error("Your sign-in session does not contain a user ID. Please sign out and sign in again.");
  const userDocRef = doc(null, "users", uid);
  const snapshot = await getDoc(userDocRef);
  const placeholder = (value) => !value || ["learner", "student", "user"].includes(String(value).trim().toLowerCase());
  const metadata = user.user_metadata || user.metadata || {};
  const candidates = [user.name, user.displayName, user.fullName, metadata.name, metadata.full_name, metadata.fullName, metadata.display_name]
    .map((value) => String(value || "").trim()).filter((value) => value && !placeholder(value));
  const emailName = String(user.email || "").split("@")[0].replace(/[._-]+/g, " ").trim();
  const authName = candidates[0] || emailName || "StudyGroup student";
  const handleBase = String(user.email || authName).split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 14) || "student";
  if (snapshot.exists()) {
    const existing = snapshot.data() || {};
    const updates = {};
    if (placeholder(existing.displayName) || existing.displayName === emailName) updates.displayName = authName;
    if (placeholder(existing.nickname) || existing.nickname === emailName) updates.nickname = authName;
    if (!existing.handle) updates.handle = `${handleBase}_${String(uid).slice(-4)}`;
    if (!existing.uid) updates.uid = uid;
    if (Object.keys(updates).length) {
      updates.updatedAt = new Date().toISOString();
      await setDoc(userDocRef, { ...existing, ...updates }, { merge: true });
      return { ...existing, ...updates };
    }
    return { ...existing, uid };
  }
  const profile = {
    uid,
    email: user.email || "",
    displayName: authName,
    nickname: authName,
    handle: `${handleBase}_${String(uid).slice(-4)}`,
    bio: "",
    boards: {},
    leaderboardOptIn: false,
    xp: 0,
    dailyGoal: "",
    weeklyMinutes: 0,
    onboardingComplete: false,
    createdAt: new Date().toISOString()
  };
  await setDoc(userDocRef, profile);
  try { sessionStorage.setItem("studygroup_welcome", "true"); } catch {}
  return profile;
}

export async function saveProfileChoices(profileData, optIn) {
  const sessionResult = await getCurrentSession();
  const authUser = getSessionUser(sessionResult);
  if (!authUser) throw new Error("No active user session found.");

  const uid = authUser.id || authUser.uid;
  const userDocRef = doc(null, "users", uid);
  const updates = {
    ...profileData,
    leaderboardOptIn: optIn,
    onboardingComplete: true,
    updatedAt: new Date().toISOString()
  };

  await setDoc(userDocRef, updates, { merge: true });

  const publicRef = doc(null, "publicLeaderboard", uid);
  if (optIn) {
    await setDoc(publicRef, {
      uid,
      displayName: profileData.displayName,
      nickname: profileData.nickname,
      handle: profileData.handle,
      xpWeekly: 0,
      xpMonthly: 0,
      xpYearly: 0,
      weekKey: (() => { const now = new Date(); const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7)); return monday.toISOString().slice(0, 10); })(),
      monthKey: new Date().toISOString().slice(0, 7),
      yearKey: `${new Date().getUTCMonth() >= 8 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1}-09-01`,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } else {
    await deleteDoc(publicRef);
  }
}

export async function saveDailyGoal(goal) {
  const sessionResult = await getCurrentSession();
  const authUser = getSessionUser(sessionResult);
  if (!authUser) throw new Error("No active user session found.");

  const uid = authUser.id || authUser.uid;
  const userDocRef = doc(null, "users", uid);
  await setDoc(userDocRef, {
    uid, dailyGoal: goal, updatedAt: new Date().toISOString()
  }, { merge: true });
}

export async function addWeeklyMinutes(minutes) {
  const sessionResult = await getCurrentSession();
  const authUser = getSessionUser(sessionResult);
  if (!authUser) throw new Error("No active user session found.");

  const uid = authUser.id || authUser.uid;
  const userDocRef = doc(null, "users", uid);
  const snapshot = await getDoc(userDocRef);
  const currentMinutes = snapshot.exists() ? (Number(snapshot.data().weeklyMinutes) || 0) : 0;
  
  await setDoc(userDocRef, {
    uid, weeklyMinutes: currentMinutes + minutes, updatedAt: new Date().toISOString()
  }, { merge: true });
}
