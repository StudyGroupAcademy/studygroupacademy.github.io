import { authClient } from "./auth-client.js";

const API_URL = "https://studygroupacademy-github-io.onrender.com/api/schools";

export async function schoolRequest(action, data = {}, { anonymous = false } = {}) {
  let token = null;
  if (!anonymous) {
    const session = await authClient.getSession();
    if (session.error) throw session.error;
    token = session.data?.session?.token || null;
    if (!token) throw new Error("Please sign in to continue.");
  }
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {})
    },
    body: JSON.stringify({ action, ...data })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `School request failed (${response.status}).`);
  return result;
}

export async function uploadSchoolFile(file, purpose, schoolId) {
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a non-empty file to upload.");
  if (file.size > 10 * 1024 * 1024) throw new Error("School files must be 10 MB or smaller.");
  const session = await authClient.getSession();
  if (session.error) throw session.error;
  const token = session.data?.session?.token;
  if (!token) throw new Error("Please sign in again before uploading a file.");
  const response = await fetch("https://studygroupacademy-github-io.onrender.com/api/cloudinary/signature", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ purpose, schoolId })
  });
  const signature = await response.json();
  if (!response.ok) throw new Error(signature.error || "The secure upload service could not authorize this file.");
  const uploadData = new FormData();
  uploadData.append("file", file);
  uploadData.append("api_key", signature.apiKey);
  uploadData.append("signature", signature.signature);
  for (const [key, value] of Object.entries(signature.params)) uploadData.append(key, String(value));
  const resultResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloudName)}/${signature.resourceType}/upload`,
    { method: "POST", body: uploadData }
  );
  const result = await resultResponse.json();
  if (!resultResponse.ok) throw new Error(result.error?.message || "Cloudinary could not store this file.");
  return {
    publicId: result.public_id,
    resourceType: result.resource_type,
    format: result.format || file.name.split(".").pop(),
    bytes: result.bytes,
    originalFilename: result.original_filename || file.name
  };
}
