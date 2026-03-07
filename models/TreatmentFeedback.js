import mongoose from 'mongoose';

const treatmentFeedbackSchema = mongoose.Schema({
    diagnosisId: {
        type: String,
        required: true,
        index: true,
    },
    userId: {
        type: String,
        default: 'anonymous',
    },
    rating: {
        type: String,
        enum: ['helpful', 'not_helpful'],
        required: true,
    },
    comment: {
        type: String,
        default: '',
        maxlength: 1000,
    },
    // Denormalized fields for analytics queries
    crop: {
        type: String,
        default: '',
    },
    disease: {
        type: String,
        default: '',
    },
    severity: {
        type: String,
        default: '',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    }
});

// Compound index: one feedback per user per diagnosis
treatmentFeedbackSchema.index({ diagnosisId: 1, userId: 1 }, { unique: true });

const TreatmentFeedback = mongoose.model('TreatmentFeedback', treatmentFeedbackSchema);

export default TreatmentFeedback;
