import axios from "axios";
import FormData from "form-data";

export const predictDisease = async (fileBuffer, filename) => {
  const form = new FormData();

  form.append("file", fileBuffer, filename);

  // AI_SERVICE_URL must be set to https://bhuvid-cropaid.hf.space in Render env vars.
  // The fallback below is only for local development.
  const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "https://bhuvid-cropaid.hf.space";

  console.log(`Calling AI service at: ${AI_SERVICE_URL}/predict`);

  const response = await axios.post(
    `${AI_SERVICE_URL}/predict`,
    form,
    {
      headers: form.getHeaders(),
      // 90s timeout — HuggingFace Spaces can have cold starts of 60-80s
      timeout: 90000,
      // Allow large responses (heatmap base64 can be large)
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 50 * 1024 * 1024,
    }
  );

  return response.data;
};
