import express from "express";
import multer from "multer";
import llmService from "../services/llmService.js";
import { predictDisease } from "../services/cnnService.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/crop-advice
 * Generate crop disease advice from disease detection (Text/JSON input)
 * Used by LLMAdvicePage.jsx
 */
router.post('/crop-advice', async (req, res) => {
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
router.post('/crop-advice/batch', async (req, res) => {
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

    console.log("CNN Prediction:", prediction.class_index);

    // TODO: Map class_index to disease name properly.
    // Currently hardcoded as placeholder based on remote commit.
    const disease = "Leaf_Mold"; // map later properly

    const advice = await llmService.generateCropAdvice({
      crop: "Tomato", // TODO: Detect crop type or accept as param
      disease,
      severity: "Moderate",
      confidence: prediction.confidence
    });

    res.json({
      success: true,
      disease,
      confidence: prediction.confidence,
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

          const disease = "Leaf_Mold"; // map later properly
          const crop = "Tomato";

          const advice = await llmService.generateCropAdvice({
            crop,
            disease,
            severity: "Moderate",
            confidence: prediction.confidence
          });

          return {
            success: true,
            filename: file.originalname,
            disease,
            confidence: prediction.confidence,
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

export default router;
