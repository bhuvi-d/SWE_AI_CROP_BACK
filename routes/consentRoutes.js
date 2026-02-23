import express from 'express';
import mongoose from 'mongoose';
import ConsentLog from '../models/ConsentLog.js';

const router = express.Router();

// @desc    Log consent
// @route   POST /api/consent
router.post('/', async (req, res) => {
    const { userId, agreed } = req.body;

    // Capture the remote IP safely. In production with reverse proxies like Nginx or Vercel, this is usually set properly if trust proxy is configured.
    const ipAddress = req.ip || req.connection.remoteAddress;

    try {
        const consentData = {
            agreed,
            ipAddress
        };

        // If a valid userId is provided, attach it.
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            consentData.user = userId;
        }

        const consent = await ConsentLog.create(consentData);
        res.status(201).json(consent);
    } catch (error) {
        console.error("Failed to insert consent log: ", error);
        res.status(500).json({ message: error.message });
    }
});

export default router;
