import mongoose from 'mongoose';

const diagnosisRecordSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    imageUrl: {
        type: String, // URL or base64 (if small enough, but URL pref)
        required: true
    },
    predictedDisease: {
        type: String,
        required: true
    },
    confidenceScore: Number,
    treatmentSuggested: String,
    severity: {
        level: { type: String, enum: ['healthy', 'mild', 'moderate', 'severe'], default: 'moderate' },
        label: { type: String, default: 'Moderate' },
        description: String,
    },
    topPredictions: [{
        class_index: Number,
        class_name: String,
        crop: String,
        disease: String,
        confidence: Number,
    }],
    heatmapUrl: String, // URL to stored heatmap image (optional)
    timestamp: {
        type: Date,
        default: Date.now
    }
});

const DiagnosisRecord = mongoose.model('DiagnosisRecord', diagnosisRecordSchema);

export default DiagnosisRecord;
