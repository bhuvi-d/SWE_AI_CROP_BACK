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
    const { phoneNumber, email } = req.body;

    if (!phoneNumber && !email) {
        return res.status(400).json({ message: 'Phone number or Email is required' });
    }

    try {
        // Find existing user by either match
        let query = [];
        if (phoneNumber) query.push({ phoneNumber });
        if (email) query.push({ email });

        let user = await User.findOne({ $or: query });

        if (!user) {
            // New user — create with whatever identifiers are provided
            user = await User.create({ phoneNumber, email });
            await AppSettings.create({ user: user._id });
        } else {
            // Update existing user if a new piece of info is provided
            if (phoneNumber && !user.phoneNumber) user.phoneNumber = phoneNumber;
            if (email && !user.email) user.email = email;
            if (user.isModified()) await user.save();
        }

        // Generate and save a 6-digit OTP
        const otpCode = crypto.randomInt(100000, 999999).toString();

        // Clear previous OTPs for this user's identifiers
        await Otp.deleteMany({
            $or: [
                phoneNumber ? { phoneNumber } : null,
                email ? { email } : null
            ].filter(Boolean)
        });

        await Otp.create({ phoneNumber, email, otp: otpCode });

        // MOCK DELIVERY LOGS
        console.log(`\n==========================================`);
        if (phoneNumber) {
            console.log(`== MOCK SMS GATEWAY == Sending OTP: [ ${otpCode} ] to ${phoneNumber}`);
        }
        if (email) {
            console.log(`== MOCK EMAIL GATEWAY == Sending OTP: [ ${otpCode} ] to ${email}`);
        }
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
        const { phoneNumber, email, otp } = req.body;

        if ((!phoneNumber && !email) || !otp) {
            return res.status(400).json({ message: 'Identifier and OTP are required' });
        }

        // Verify OTP against Database
        let otpQuery = { otp };
        if (phoneNumber) otpQuery.phoneNumber = phoneNumber;
        if (email) otpQuery.email = email;

        const otpRecord = await Otp.findOne(otpQuery);

        if (!otpRecord) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        // OTP is valid, remove it
        await Otp.deleteOne({ _id: otpRecord._id });

        // Find the user by whatever identifier was used
        const user = await User.findOne({
            $or: [
                phoneNumber ? { phoneNumber } : null,
                email ? { email } : null
            ].filter(Boolean)
        });

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
            email: user.email,
            name: user.name,
            token: token
        });

    } catch (error) {
        console.error("Verify route error:", error);
        res.status(500).json({ message: error.message });
    }
});

export default router;
