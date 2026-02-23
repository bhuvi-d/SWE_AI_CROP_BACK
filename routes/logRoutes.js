import express from 'express';
// Optional schema: You could also import mongoose and map these to a `Log` model later.
// For now, logging to stdout since requirement is generic centralized handling.
const router = express.Router();

/**
 * @desc    POST /api/logs
 * @summary Ingests frontend generic logs and errors 
 */
router.post('/', (req, res) => {
    try {
        const { level, context, message, stack, metadata, timestamp } = req.body;

        switch (level) {
            case 'error':
                console.error(`\n================= FRONTEND ERROR =================`);
                console.error(`Time: ${timestamp}`);
                console.error(`Context: ${context}`);
                console.error(`Message: ${message}`);
                console.error(`Metadata: ${JSON.stringify(metadata)}`);
                if (stack) console.error(`Stack: \n${stack}`);
                console.error(`==================================================\n`);
                break;
            case 'warn':
                console.warn(`[Frontend Warn] ${context}: ${message}`);
                break;
            case 'info':
            case 'success':
            default:
                console.log(`[Frontend Info] ${context}: ${message}`);
        }

        res.status(200).json({ success: true });
    } catch (e) {
        console.error("Failed to parse log payload", e);
        res.status(500).json({ success: false });
    }
});

export default router;
