import express from 'express';
import llmService from '../services/llmService.js';

const router = express.Router();

/**
 * POST /api/crop-advice
 * Generate crop disease advice from disease detection
 * 
 * Request body:
 * {
 *   "crop": "Tomato",
 *   "disease": "Early Blight",
 *   "severity": "medium",
 *   "confidence": 0.93
 * }
 */
router.post('/crop-advice', async (req, res) => {
    try {
        const { crop, disease, severity, confidence } = req.body;

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

        console.log(`📝 Request: Generating advice for ${crop} - ${disease}`);

        // Generate advice using Gemini AI
        const advice = await llmService.generateCropAdvice({
            crop,
            disease,
            severity: severity || 'unknown',
            confidence: confidence || 0.0
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
 * Generate advice for multiple diseases at once
 * 
 * Request body:
 * {
 *   "diseases": [
 *     { "crop": "Tomato", "disease": "Early Blight", "severity": "medium", "confidence": 0.93 },
 *     { "crop": "Potato", "disease": "Late Blight", "severity": "high", "confidence": 0.87 }
 *   ]
 * }
 */
router.post('/crop-advice/batch', async (req, res) => {
    try {
        const { diseases } = req.body;

        if (!diseases || !Array.isArray(diseases) || diseases.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Missing or invalid diseases array'
            });
        }

        // Validate all entries
        for (const diseaseData of diseases) {
            if (!diseaseData.crop || !diseaseData.disease) {
                return res.status(400).json({
                    success: false,
                    error: 'Each disease entry must have crop and disease fields'
                });
            }
        }

        console.log(`📝 Batch Request: Generating advice for ${diseases.length} diseases`);

        // Generate advice for all
        const adviceList = await llmService.generateBatchAdvice(diseases);

        res.json({
            success: true,
            data: adviceList
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
 * GET /api/test
 * Test endpoint to verify API is working
 */
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Crop Advice API is working!',
        timestamp: new Date().toISOString(),
        endpoints: [
            'POST /api/crop-advice',
            'POST /api/crop-advice/batch',
            'GET /api/test'
        ]
    });
});

export default router;
