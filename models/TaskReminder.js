import mongoose from 'mongoose';

/**
 * TaskReminder Schema — Separate from FarmTask.
 * 
 * Represents a daily reminder/notification task for farmers.
 * Created from the web calendar, delivered as notifications on the Flutter app.
 * Supports recurrence (daily, weekly, etc.) so farmers don't re-fill forms daily.
 * 
 * Flow:
 *   Web creates reminder → Backend stores + emits via Socket.IO →
 *   App fetches upcoming → Schedules local notifications (10min, 5min, at-time) →
 *   Farmer taps notification → Done/Not Done popup → Status synced back in real-time
 */
const taskReminderSchema = new mongoose.Schema({
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
    message: {
        type: String,
        default: '',
        trim: true
    },
    taskType: {
        type: String,
        enum: ['watering', 'fertilizer', 'pesticide', 'harvest', 'sowing', 'pruning',
            'soil_testing', 'irrigation_check', 'weeding', 'mulching', 'market_visit',
            'equipment_maintenance', 'weather_check', 'seed_purchase', 'other'],
        default: 'other'
    },
    cropName: {
        type: String,
        default: ''
    },

    // Scheduling
    date: {
        type: Date,
        required: true
    },
    time: {
        type: String,
        required: true,
        match: /^([01]\d|2[0-3]):([0-5]\d)$/ // HH:mm 24hr format
    },
    scheduledAt: {
        type: Date
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },

    // Recurrence — so farmers don't re-fill the same task daily
    isRecurring: {
        type: Boolean,
        default: false
    },
    recurrencePattern: {
        type: String,
        enum: ['daily', 'weekly', 'biweekly', 'monthly', 'custom', 'none'],
        default: 'none'
    },
    recurrenceEndDate: {
        type: Date,
        default: null
    },
    customRecurrenceDays: {
        // For custom: e.g. [1, 3, 5] = Mon, Wed, Fri (0=Sun, 6=Sat)
        type: [Number],
        default: []
    },
    parentReminderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TaskReminder',
        default: null
    },

    // Status tracking
    status: {
        type: String,
        enum: ['pending', 'done', 'skipped', 'overdue', 'snoozed'],
        default: 'pending'
    },
    completedAt: {
        type: Date,
        default: null
    },
    completedFrom: {
        // Track where the task was completed (app notification, app screen, web)
        type: String,
        enum: ['app_notification', 'app_screen', 'web', null],
        default: null
    },

    // Notification tracking
    notificationSent: {
        tenMin: { type: Boolean, default: false },
        fiveMin: { type: Boolean, default: false },
        atTime: { type: Boolean, default: false }
    },

    // Smart features for farmers
    weatherDependent: {
        // If true, remind farmer to check weather before doing this task
        type: Boolean,
        default: false
    },
    notes: {
        type: String,
        default: ''
    },
    estimatedDuration: {
        // In minutes — helps farmer plan their day
        type: Number,
        default: null
    },
    linkedCropAdvice: {
        // If this reminder was auto-generated from a crop diagnosis recommendation
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DiagnosisRecord',
        default: null
    }
}, {
    timestamps: true // auto createdAt + updatedAt
});

// Pre-save: compute scheduledAt from date + time
taskReminderSchema.pre('save', function () {
    if (this.date && this.time) {
        const dateStr = new Date(this.date).toISOString().split('T')[0];
        this.scheduledAt = new Date(`${dateStr}T${this.time}:00.000Z`);
    }
});

// Indexes for efficient queries
taskReminderSchema.index({ user: 1, scheduledAt: 1 });
taskReminderSchema.index({ user: 1, status: 1 });
taskReminderSchema.index({ scheduledAt: 1, status: 1 });
taskReminderSchema.index({ user: 1, date: 1 });

const TaskReminder = mongoose.model('TaskReminder', taskReminderSchema);

export default TaskReminder;
