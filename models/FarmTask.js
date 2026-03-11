import mongoose from 'mongoose';

const farmTaskSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    taskType: {
        type: String,
        enum: ['watering', 'fertilizer', 'pesticide', 'harvest', 'sowing', 'pruning', 'soil_testing', 'irrigation_check', 'weeding', 'mulching', 'other'],
        default: 'other'
    },
    cropName: {
        type: String,
        default: ''
    },
    date: {
        type: Date,
        required: true
    },
    time: {
        type: String,
        required: true,
        match: /^([01]\d|2[0-3]):([0-5]\d)$/  // HH:mm 24hr format
    },
    scheduledAt: {
        type: Date
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    isRecurring: {
        type: Boolean,
        default: false
    },
    recurrencePattern: {
        type: String,
        enum: ['daily', 'weekly', 'biweekly', 'monthly', 'none'],
        default: 'none'
    },
    recurrenceEndDate: {
        type: Date,
        default: null
    },
    parentTaskId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FarmTask',
        default: null
    },
    status: {
        type: String,
        enum: ['pending', 'done', 'skipped', 'overdue'],
        default: 'pending'
    },
    completedAt: {
        type: Date,
        default: null
    },
    notificationSent: {
        tenMin: { type: Boolean, default: false },
        fiveMin: { type: Boolean, default: false },
        atTime: { type: Boolean, default: false }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Pre-save: compute scheduledAt from date + time, update updatedAt
farmTaskSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    if (this.date && this.time) {
        const dateStr = new Date(this.date).toISOString().split('T')[0];
        this.scheduledAt = new Date(`${dateStr}T${this.time}:00.000Z`);
    }

    next();
});

// Index for efficient queries
farmTaskSchema.index({ user: 1, scheduledAt: 1 });
farmTaskSchema.index({ user: 1, status: 1 });
farmTaskSchema.index({ scheduledAt: 1, status: 1 });

const FarmTask = mongoose.model('FarmTask', farmTaskSchema);

export default FarmTask;
