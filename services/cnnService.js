import axios from "axios";
import FormData from "form-data";

export const predictDisease = async (fileBuffer, filename) => {
  const form = new FormData();

  form.append("file", fileBuffer, filename);

  const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:5001";

  const response = await axios.post(
    `${AI_SERVICE_URL}/predict`,
    form,
    {
      headers: form.getHeaders(),
      // Increased timeout for Grad-CAM computation
      timeout: 60000,
      // Allow large responses (heatmap base64 can be large)
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 50 * 1024 * 1024,
    }
  );

  return response.data;
};
