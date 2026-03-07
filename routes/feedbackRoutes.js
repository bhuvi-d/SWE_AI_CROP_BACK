import express from 'express';
import TreatmentFeedback from '../models/TreatmentFeedback.js';

const router = express.Router();

// @desc    Submit treatment feedback (thumbs up/down + optional comment)
// @route   POST /api/feedback
router.post('/', async (req, res) => {
    const { diagnosisId, userId, rating, comment, crop, disease, severity } = req.body;

    if (!diagnosisId || !rating) {
        return res.status(400).json({ message: 'diagnosisId and rating are required' });
    }

    if (!['helpful', 'not_helpful'].includes(rating)) {
        return res.status(400).json({ message: 'rating must be "helpful" or "not_helpful"' });
    }

    try {
        // Upsert: update if already exists, create if not
        const feedback = await TreatmentFeedback.findOneAndUpdate(
            { diagnosisId, userId: userId || 'anonymous' },
            {
                diagnosisId,
                userId: userId || 'anonymous',
                rating,
                comment: comment || '',
                crop: crop || '',
                disease: disease || '',
                severity: severity || '',
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.status(201).json({
            success: true,
            message: 'Feedback submitted successfully',
            feedback,
        });
    } catch (error) {
        console.error('Error submitting feedback:', error);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Get feedback for a specific diagnosis
// @route   GET /api/feedback/:diagnosisId
router.get('/:diagnosisId', async (req, res) => {
    try {
        const feedbacks = await TreatmentFeedback.find({
            diagnosisId: req.params.diagnosisId
        }).sort({ createdAt: -1 });

        res.json({
            success: true,
            count: feedbacks.length,
            feedbacks,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Get aggregate feedback stats for a disease (for analytics)
// @route   GET /api/feedback/stats/:disease
router.get('/stats/:disease', async (req, res) => {
    try {
        const stats = await TreatmentFeedback.aggregate([
            { $match: { disease: req.params.disease } },
            {
                $group: {
                    _id: '$rating',
                    count: { $sum: 1 },
                }
            }
        ]);

        const helpful = stats.find(s => s._id === 'helpful')?.count || 0;
        const notHelpful = stats.find(s => s._id === 'not_helpful')?.count || 0;
        const total = helpful + notHelpful;

        res.json({
            success: true,
            disease: req.params.disease,
            stats: {
                helpful,
                notHelpful,
                total,
                helpfulPercentage: total > 0 ? Math.round((helpful / total) * 100) : 0,
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

export default router;
