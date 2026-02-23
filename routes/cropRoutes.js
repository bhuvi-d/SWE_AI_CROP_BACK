import express from 'express';
import CropPreference from '../models/CropPreference.js';
import mongoose from 'mongoose';

const router = express.Router();

// @desc    Get user crops
// @route   GET /api/crops/:userId
router.get('/:userId', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
            return res.json([]); // Return empty array if not a valid user id (e.g. anonymous or pending migration)
        }
        const crops = await CropPreference.findOne({ user: req.params.userId });
        res.json(crops ? crops.selectedCrops : []);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Update user crops
// @route   POST /api/crops
router.post('/', async (req, res) => {
    const { userId, selectedCrops } = req.body;

    try {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'Invalid user ID format' });
        }

        let preference = await CropPreference.findOne({ user: userId });

        if (preference) {
            preference.selectedCrops = selectedCrops;
            await preference.save();
        } else {
            preference = await CropPreference.create({
                user: userId,
                selectedCrops
            });
        }
        res.json(preference.selectedCrops);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

export default router;
