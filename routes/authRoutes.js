import express from 'express';
import User from '../models/User.js';
import AppSettings from '../models/AppSettings.js';
import Otp from '../models/Otp.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Mock OTP generation and verification
// IN REAL APP: Integrate with SMS Gateway

// @desc    Register/Login user
// @route   POST /api/auth/login
router.post('/login', async (req, res) => {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
        return res.status(400).json({ message: 'Phone number is required' });
    }

    try {
        let user = await User.findOne({ phoneNumber });

        if (!user) {
            user = await User.create({ phoneNumber });
            // Initialize settings for new user
            await AppSettings.create({ user: user._id });
        }

        // Generate and save a 6-digit OTP
        const otpCode = crypto.randomInt(100000, 999999).toString();

        // Remove existing OTP for this number if it exists
        await Otp.deleteMany({ phoneNumber });

        await Otp.create({ phoneNumber, otp: otpCode });

        console.log(`\n==========================================`);
        console.log(`== MOCK SMS GATEWAY ==`);
        console.log(`Sending OTP: [ ${otpCode} ] to ${phoneNumber}`);
        console.log(`==========================================\n`);

        res.json({
            message: 'OTP sent successfully',
            userId: user._id
        });
    } catch (error) {
        console.error("Login route error:", error);
        res.status(500).json({ message: error.message });
    }
});

// @desc    Verify OTP
// @route   POST /api/auth/verify
router.post('/verify', async (req, res) => {
    try {
        const { phoneNumber, otp } = req.body;

        if (!phoneNumber || !otp) {
            return res.status(400).json({ message: 'Phone number and OTP are required' });
        }

        // Verify OTP against Database
        const otpRecord = await Otp.findOne({ phoneNumber, otp });

        if (!otpRecord) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        // OTP is valid, remove it
        await Otp.deleteOne({ _id: otpRecord._id });

        const user = await User.findOne({ phoneNumber });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Generate JWT Token
        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET || 'swe_default_secret_key_123',
            { expiresIn: '30d' }
        );

        res.json({
            _id: user._id,
            phoneNumber: user.phoneNumber,
            name: user.name,
            token: token
        });

    } catch (error) {
        console.error("Verify route error:", error);
        res.status(500).json({ message: error.message });
    }
});

export default router;
