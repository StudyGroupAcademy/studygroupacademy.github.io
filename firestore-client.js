import { authClient } from "./auth-client.js";

const API_URL = "https://studygroupacademy-github-io.onrender.com/api/data";
const SERVER_TIMESTAMP = "__studygroupServerTimestamp";

function reference(path, kind) {
  if (!Array.isArray(path) || path.length === 0 || path.some((part) => typeof part !== "string" || !part)) {
    throw new TypeError("A valid database path is required.");
  }
  return { path, kind };
}

function encodeValue(value) {
  if (value?.__studygroupOperation) {
    return {
      __studygroupOperation: value.__studygroupOperation,
      values: value.values?.map(encodeValue)
    };
  }
  if (Array.isArray(value)) return value.map(encodeValue);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]));
  }
  return value instanceof Date ? value.toISOString() : value;
}

function decodeValue(value) {
  if (value === SERVER_TIMESTAMP) {
    const date = new Date();
    return { toDate: () => date };
  }
  if (Array.isArray(value)) return value.map(decodeValue);
  if (value && typeof value === "object") {
    if (value.__studygroupTimestamp) {
      const date = new Date(value.__studygroupTimestamp);
      return { toDate: () => date };
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeValue(item)]));
  }
  return value;
}

async function request(payload, allowAnonymous = false) {
  let token = null;
  if (!allowAnonymous) {
    const session = await authClient.getSession();
    if (session.error) throw session.error;
    token = session.data?.session?.token || null;
    if (!token) throw new Error("Please sign in to access your StudyGroup data.");
  }

  let response;
  try {
    response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `StudyGroup could not reach its Render API from ${window.location.origin}. ` +
        "Check that the Render service is running and that this exact origin is included in FRONTEND_ORIGIN or FRONTEND_ORIGINS."
      );
    }
    throw error;
  }
  const responseText = await response.text();
  let result;
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch (error) {
    throw new Error(`The StudyGroup API returned an unreadable response (${response.status}).`);
  }
  if (!response.ok) throw new Error(result.error || `Database request failed (${response.status}).`);
  return result;
}

function snapshot(path, data) {
  const id = path.at(-1);
  const exists = data !== null && data !== undefined;
  return {
    id,
    ref: reference(path, path.length % 2 === 0 ? "document" : "collection"),
    exists: () => exists,
    data: () => (exists ? decodeValue(data) : undefined)
  };
}

export function collection(_db, ...path) {
  return reference(path, "collection");
}

export function doc(_dbOrCollection, ...path) {
  if (_dbOrCollection?.kind === "collection") {
    if (path.length > 1) throw new TypeError("A document ID must be one path segment.");
    return reference([..._dbOrCollection.path, path[0] || crypto.randomUUID()], "document");
  }
  return reference(path, "document");
}

export function serverTimestamp() {
  return { __studygroupOperation: "serverTimestamp" };
}

export function arrayUnion(...values) {
  return { __studygroupOperation: "arrayUnion", values };
}

export function arrayRemove(...values) {
  return { __studygroupOperation: "arrayRemove", values };
}

export function where(field, operator, value) {
  return { kind: "where", field, operator, value };
}

export function orderBy(field, direction = "asc") {
  return { kind: "orderBy", field, direction };
}

export function limit(count) {
  return { kind: "limit", count };
}

export function query(collectionRef, ...constraints) {
  if (collectionRef.kind !== "collection") throw new TypeError("Queries require a collection reference.");
  return { ...collectionRef, constraints };
}

export async function getDoc(ref) {
  const result = await request({ op: "get", path: ref.path }, ref.path[0] === "publicLeaderboard");
  return snapshot(ref.path, result.data);
}

export async function getDocs(ref) {
  const result = await request({
    op: "list",
    path: ref.path,
    constraints: (ref.constraints || []).map((constraint) => ({ ...constraint, value: encodeValue(constraint.value) }))
  }, ref.path[0] === "publicLeaderboard");
  const docs = result.docs.map((entry) => snapshot(entry.path, entry.data));
  return { docs, empty: docs.length === 0, size: docs.length };
}

export async function setDoc(ref, data, options = {}) {
  await request({ op: "set", path: ref.path, data: encodeValue(data), merge: options.merge === true });
}

export async function updateDoc(ref, data) {
  await request({ op: "update", path: ref.path, data: encodeValue(data) });
}

export async function completeActivity(activityId) {
  return request({ op: "completeActivity", activityId });
}

export async function deleteDoc(ref) {
  await request({ op: "delete", path: ref.path });
}

export async function addDoc(ref, data) {
  const newRef = doc(ref, crypto.randomUUID());
  await setDoc(newRef, data);
  return newRef;
}

export function onSnapshot(ref, next, error = () => {}) {
  let active = true;
  let running = false;
  const poll = async () => {
    if (!active || running) return;
    running = true;
    try {
      const result = ref.kind === "collection" || ref.constraints
        ? await getDocs(ref)
        : await getDoc(ref);
      if (active) next(result);
    } catch (caught) {
      if (active) error(caught);
    } finally {
      running = false;
    }
  };
  poll();
  const timer = window.setInterval(poll, 5000);
  return () => {
    active = false;
    window.clearInterval(timer);
  };
}

export function writeBatch() {
  const changes = [];
  return {
    set(ref, data, options = {}) {
      changes.push({ op: "set", path: ref.path, data: encodeValue(data), merge: options.merge === true });
      return this;
    },
    update(ref, data) {
      changes.push({ op: "update", path: ref.path, data: encodeValue(data) });
      return this;
    },
    delete(ref) {
      changes.push({ op: "delete", path: ref.path });
      return this;
    },
    async commit() {
      await request({ op: "batch", changes });
    }
  };
}
