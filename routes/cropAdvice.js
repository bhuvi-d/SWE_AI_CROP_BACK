import express from "express";
import multer from "multer";
import llmService from "../services/llmService.js";
import { predictDisease } from "../services/cnnService.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const CLASS_NAMES = [
  "Apple___Apple_scab", "Apple___Black_rot", "Apple___Cedar_apple_rust", "Apple___healthy",
  "Blueberry___healthy", "Cherry_(including_sour)___Powdery_mildew", "Cherry_(including_sour)___healthy",
  "Corn_(maize)___Cercospora_leaf_spot", "Corn_(maize)___Common_rust", "Corn_(maize)___Northern_Leaf_Blight", "Corn_(maize)___healthy",
  "Grape___Black_rot", "Grape___Esca_(Black_Measles)", "Grape___Leaf_blight", "Grape___healthy",
  "Orange___Haunglongbing", "Peach___Bacterial_spot", "Peach___healthy",
  "Pepper,_bell___Bacterial_spot", "Pepper,_bell___healthy",
  "Potato___Early_blight", "Potato___Late_blight", "Potato___healthy",
  "Raspberry___healthy", "Soybean___healthy", "Squash___Powdery_mildew",
  "Strawberry___Leaf_scorch", "Strawberry___healthy",
  "Tomato___Bacterial_spot", "Tomato___Early_blight", "Tomato___Late_blight", "Tomato___Leaf_Mold",
  "Tomato___Septoria_leaf_spot", "Tomato___Spider_mites", "Tomato___Target_Spot",
  "Tomato___Yellow_Leaf_Curl_Virus", "Tomato___Tomato_mosaic_virus", "Tomato___healthy"
];

/**
 * Helper to split label like "Tomato___Early_blight" into { crop: "Tomato", disease: "Early blight" }
 */
const parseLabel = (label) => {
  if (!label) return { crop: "Unknown", disease: "Unknown" };
  const parts = label.split("___");
  const crop = parts[0].replace(/_/g, " ").replace(/\(.*\)/g, "").trim();
  const disease = parts[1] ? parts[1].replace(/_/g, " ").trim() : "Unknown";
  return { crop, disease };
};

/**
 * POST /api/crop-advice
 * Generate crop disease advice from disease detection (Text/JSON input)
 * Used by LLMAdvicePage.jsx
 */
router.post('/', async (req, res) => {
  try {
    const { crop, disease, severity, confidence, language } = req.body;

    // Validate input
    if (!crop || !disease) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: crop and disease are required'
      });
    }

    // Validate confidence (should be between 0 and 1)
    if (confidence !== undefined && (confidence < 0 || confidence > 1)) {
      return res.status(400).json({
        success: false,
        error: 'Confidence must be between 0 and 1'
      });
    }

    console.log(`📝 Request: Generating advice for ${crop} - ${disease} in ${language || 'en'}`);

    // Generate advice using Gemini AI
    const advice = await llmService.generateCropAdvice({
      crop,
      disease,
      severity: severity || 'unknown',
      confidence: confidence || 0.0,
      language: language || 'en'
    });

    res.json({
      success: true,
      data: advice
    });

  } catch (error) {
    console.error('Error in /crop-advice endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate crop advice'
    });
  }
});

/**
 * POST /api/crop-advice/batch
 * Generate batch crop disease advice for multiple inputs
 * Used by multi-image batch diagnosis
 */
router.post('/batch', async (req, res) => {
  try {
    const { diseases } = req.body;

    if (!Array.isArray(diseases) || diseases.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required array of diseases'
      });
    }

    console.log(`📝 Request: Generating batch advice for ${diseases.length} items`);

    // Create an array of formatted inputs, defaulting where needed
    const formattedDataArray = diseases.map(item => ({
      crop: item.crop || 'Unknown',
      disease: item.disease || 'Unknown',
      severity: item.severity || 'unknown',
      confidence: item.confidence || 0.0,
      language: item.language || 'en'
    }));

    // Check if any required fields are intrinsically still missing (we enforced defaults above, but just in case)
    const isValid = formattedDataArray.every(d => d.crop !== 'Unknown' && d.disease !== 'Unknown');
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Each item in batch must have crop and disease specified'
      });
    }

    const adviceResults = await llmService.generateBatchAdvice(formattedDataArray);

    res.json({
      success: true,
      data: adviceResults
    });

  } catch (error) {
    console.error('Error in /crop-advice/batch endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate batch crop advice'
    });
  }
});

/**
 * POST /api/analyze
 * Analyze crop image using CNN and generate advice
 * Supports image file upload
 */
router.post("/analyze", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Image file required" });
    }

    console.log("Sending image to CNN service...");

    // Call the CNN service
    const prediction = await predictDisease(req.file.buffer, req.file.originalname);

    // ---------- IMPORTANT CHECK ----------
    if (!prediction.success) {
      return res.json({
        success: false,
        message: prediction.error
      });
    }
    // -------------------------------------

    const classIdx = prediction.class_index;
    const label = prediction.class_name || CLASS_NAMES[classIdx];
    const crop = prediction.crop_name || parseLabel(label).crop;
    const disease = prediction.disease_name || parseLabel(label).disease;
    const severity = prediction.severity || { level: "moderate", label: "Moderate", description: "" };
    const topPredictions = prediction.top_predictions || [];
    const heatmapBase64 = prediction.heatmap_base64 || null;

    console.log(`CNN Prediction: ${label} (Index: ${classIdx}), Severity: ${severity.level}`);

    const advice = await llmService.generateCropAdvice({
      crop,
      disease,
      severity: severity.label,
      confidence: prediction.confidence
    });

    res.json({
      success: true,
      crop,
      disease,
      confidence: prediction.confidence,
      severity,
      topPredictions,
      heatmapBase64,
      advice
    });

  } catch (error) {
    console.error("Prediction pipeline error:", error.message);
    res.status(500).json({ error: "Prediction pipeline failed" });
  }
});

/**
 * @desc    POST /api/analyze/batch
 * @summary Analyze multiple crop images concurrently
 */
router.post("/analyze/batch", upload.array("files", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "Image files required" });
    }

    console.log(`Processing batch of ${req.files.length} images...`);

    // Process all files concurrently
    const analysisResults = await Promise.all(
      req.files.map(async (file, index) => {
        try {
          const prediction = await predictDisease(file.buffer, file.originalname);

          if (!prediction.success) {
            return {
              success: false,
              filename: file.originalname,
              error: prediction.error,
              index
            };
          }

          const classIdx = prediction.class_index;
          const label = prediction.class_name || CLASS_NAMES[classIdx];
          const crop = prediction.crop_name || parseLabel(label).crop;
          const disease = prediction.disease_name || parseLabel(label).disease;
          const severity = prediction.severity || { level: "moderate", label: "Moderate", description: "" };
          const topPredictions = prediction.top_predictions || [];
          const heatmapBase64 = prediction.heatmap_base64 || null;

          const advice = await llmService.generateCropAdvice({
            crop,
            disease,
            severity: severity.label,
            confidence: prediction.confidence
          });

          return {
            success: true,
            filename: file.originalname,
            crop,
            disease,
            confidence: prediction.confidence,
            severity,
            topPredictions,
            heatmapBase64,
            advice,
            index
          };

        } catch (err) {
          return {
            success: false,
            filename: file.originalname,
            error: err.message,
            index
          };
        }
      })
    );

    res.json({
      success: true,
      results: analysisResults
    });

  } catch (error) {
    console.error("Batch prediction failure:", error.message);
    res.status(500).json({ error: "Batch prediction pipeline failed" });
  }
});

/**
 * POST /api/chat
 * Chatbot endpoint for agricultural advice
 */
router.post("/chat", async (req, res) => {
  try {
    const { message, systemPrompt } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const response = await llmService.chatWithAI(message, systemPrompt);
    res.json({ success: true, response });
  } catch (error) {
    console.error("Chat error:", error.message);
    res.status(500).json({ error: "Failed to get AI response" });
  }
});

export default router;
