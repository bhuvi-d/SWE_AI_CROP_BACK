import express from 'express';
import DiagnosisRecord from '../models/DiagnosisRecord.js';

const router = express.Router();

// @desc    Get user diagnosis history
// @route   GET /api/diagnosis/:userId
router.get('/:userId', async (req, res) => {
    try {
        const records = await DiagnosisRecord.find({ user: req.params.userId }).sort({ timestamp: -1 });
        res.json(records);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Save diagnosis
// @route   POST /api/diagnosis
router.post('/', async (req, res) => {
    const {
        userId,
        imageUrl,
        predictedDisease,
        confidenceScore,
        treatmentSuggested,
        severity,
        topPredictions,
        heatmapUrl,
    } = req.body;

    try {
        const record = await DiagnosisRecord.create({
            user: userId,
            imageUrl,
            predictedDisease,
            confidenceScore,
            treatmentSuggested,
            severity,
            topPredictions,
            heatmapUrl,
        });
        res.status(201).json(record);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

export default router;
