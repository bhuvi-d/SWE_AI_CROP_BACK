import express from 'express';
import TaskReminder from '../models/TaskReminder.js';

const router = express.Router();

// ────────────────────────────────────────
// GET /api/task-reminders/:userId
// Get all reminders for a user
// ────────────────────────────────────────
router.get('/:userId', async (req, res) => {
    try {
        const reminders = await TaskReminder.find({ user: req.params.userId })
            .sort({ scheduledAt: 1 });
        res.json(reminders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ────────────────────────────────────────
// GET /api/task-reminders/:userId/today
// Get today's reminders
// ────────────────────────────────────────
router.get('/:userId/today', async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const reminders = await TaskReminder.find({
            user: req.params.userId,
            scheduledAt: { $gte: startOfDay, $lte: endOfDay }
        }).sort({ scheduledAt: 1 });

        res.json(reminders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ────────────────────────────────────────
// GET /api/task-reminders/:userId/upcoming
// Get upcoming reminders (next 24 hours, pending only) for notification scheduling
// ────────────────────────────────────────
router.get('/:userId/upcoming', async (req, res) => {
    try {
        const now = new Date();
        const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        const reminders = await TaskReminder.find({
            user: req.params.userId,
            scheduledAt: { $gte: now, $lte: next24h },
            status: 'pending'
        }).sort({ scheduledAt: 1 });

        res.json(reminders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ────────────────────────────────────────
// POST /api/task-reminders
// Create a new reminder (+ recurrence instances)
// ────────────────────────────────────────
router.post('/', async (req, res) => {
    const {
        userId, title, message, taskType, cropName,
        date, time, priority, notes, estimatedDuration,
        weatherDependent,
        isRecurring, recurrencePattern, recurrenceEndDate,
        customRecurrenceDays
    } = req.body;

    try {
        if (!userId || !title || !date || !time) {
            return res.status(400).json({ message: 'userId, title, date, and time are required' });
        }

        // Validate time format
        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
            return res.status(400).json({ message: 'Time must be in HH:mm 24-hour format' });
        }

        // Create the main reminder
        const mainReminder = await TaskReminder.create({
            user: userId,
            title,
            message: message || '',
            taskType: taskType || 'other',
            cropName: cropName || '',
            date: new Date(date),
            time,
            priority: priority || 'medium',
            notes: notes || '',
            estimatedDuration: estimatedDuration || null,
            weatherDependent: weatherDependent || false,
            isRecurring: isRecurring || false,
            recurrencePattern: isRecurring ? (recurrencePattern || 'daily') : 'none',
            recurrenceEndDate: recurrenceEndDate ? new Date(recurrenceEndDate) : null,
            customRecurrenceDays: customRecurrenceDays || []
        });

        const createdReminders = [mainReminder];

        // Generate recurrence instances
        if (isRecurring && recurrencePattern && recurrencePattern !== 'none') {
            const endDate = recurrenceEndDate
                ? new Date(recurrenceEndDate)
                : new Date(new Date(date).getTime() + 30 * 24 * 60 * 60 * 1000); // Default 30 days

            let currentDate = new Date(date);

            if (recurrencePattern === 'custom' && customRecurrenceDays?.length > 0) {
                // Custom: generate for specific days of the week
                for (let i = 0; i < 366; i++) {
                    currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
                    if (currentDate > endDate) break;
                    if (!customRecurrenceDays.includes(currentDate.getDay())) continue;

                    const instance = await TaskReminder.create({
                        user: userId,
                        title, message: message || '',
                        taskType: taskType || 'other',
                        cropName: cropName || '',
                        date: currentDate, time,
                        priority: priority || 'medium',
                        notes: notes || '',
                        estimatedDuration: estimatedDuration || null,
                        weatherDependent: weatherDependent || false,
                        isRecurring: true,
                        recurrencePattern: 'custom',
                        customRecurrenceDays,
                        parentReminderId: mainReminder._id
                    });
                    createdReminders.push(instance);
                }
            } else {
                const incrementDays = {
                    daily: 1,
                    weekly: 7,
                    biweekly: 14,
                    monthly: 30
                };
                const increment = incrementDays[recurrencePattern] || 1;

                for (let i = 0; i < 365; i++) {
                    currentDate = new Date(currentDate.getTime() + increment * 24 * 60 * 60 * 1000);
                    if (currentDate > endDate) break;

                    const instance = await TaskReminder.create({
                        user: userId,
                        title, message: message || '',
                        taskType: taskType || 'other',
                        cropName: cropName || '',
                        date: currentDate, time,
                        priority: priority || 'medium',
                        notes: notes || '',
                        estimatedDuration: estimatedDuration || null,
                        weatherDependent: weatherDependent || false,
                        isRecurring: true,
                        recurrencePattern,
                        parentReminderId: mainReminder._id
                    });
                    createdReminders.push(instance);
                }
            }
        }

        // Emit real-time event via Socket.IO (attached to req by middleware)
        if (req.io) {
            req.io.to(`user_${userId}`).emit('reminder:created', {
                count: createdReminders.length,
                reminders: createdReminders
            });
        }

        res.status(201).json({
            message: `Created ${createdReminders.length} reminder(s)`,
            reminders: createdReminders
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// ────────────────────────────────────────
// PUT /api/task-reminders/:id/status
// Update reminder status (done / skipped / pending / snoozed)
// Emits real-time event for web dashboard sync
// ────────────────────────────────────────
router.put('/:id/status', async (req, res) => {
    try {
        const { status, completedFrom } = req.body;
        if (!['pending', 'done', 'skipped', 'overdue', 'snoozed'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const reminder = await TaskReminder.findById(req.params.id);
        if (!reminder) return res.status(404).json({ message: 'Reminder not found' });

        reminder.status = status;
        reminder.completedAt = status === 'done' ? new Date() : null;
        reminder.completedFrom = completedFrom || null;
        const updated = await reminder.save();

        // Emit real-time status change to all connected clients for this user
        if (req.io) {
            req.io.to(`user_${reminder.user}`).emit('reminder:statusChanged', {
                reminderId: updated._id,
                status: updated.status,
                completedAt: updated.completedAt,
                completedFrom: updated.completedFrom
            });
        }

        res.json(updated);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// ────────────────────────────────────────
// PUT /api/task-reminders/:id
// Edit reminder details
// ────────────────────────────────────────
router.put('/:id', async (req, res) => {
    try {
        const reminder = await TaskReminder.findById(req.params.id);
        if (!reminder) return res.status(404).json({ message: 'Reminder not found' });

        const allowedFields = [
            'title', 'message', 'taskType', 'cropName', 'date', 'time',
            'priority', 'notes', 'estimatedDuration', 'weatherDependent'
        ];
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                reminder[field] = field === 'date' ? new Date(req.body[field]) : req.body[field];
            }
        });

        const updated = await reminder.save();

        if (req.io) {
            req.io.to(`user_${reminder.user}`).emit('reminder:updated', updated);
        }

        res.json(updated);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// ────────────────────────────────────────
// DELETE /api/task-reminders/:id
// Delete a reminder (optionally all recurrence instances)
// ────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const reminder = await TaskReminder.findById(req.params.id);
        if (!reminder) return res.status(404).json({ message: 'Reminder not found' });

        const userId = reminder.user;

        if (req.query.deleteAll === 'true' && reminder.parentReminderId) {
            await TaskReminder.deleteMany({
                $or: [
                    { _id: reminder.parentReminderId },
                    { parentReminderId: reminder.parentReminderId },
                    { _id: reminder._id }
                ]
            });

            if (req.io) {
                req.io.to(`user_${userId}`).emit('reminder:deletedAll', {
                    parentReminderId: reminder.parentReminderId
                });
            }

            return res.json({ message: 'All recurring instances deleted' });
        }

        await reminder.deleteOne();

        if (req.io) {
            req.io.to(`user_${userId}`).emit('reminder:deleted', {
                reminderId: reminder._id
            });
        }

        res.json({ message: 'Reminder removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ────────────────────────────────────────
// PUT /api/task-reminders/:id/notification
// Mark notification as sent (tenMin, fiveMin, atTime)
// Called by the app after scheduling local notification
// ────────────────────────────────────────
router.put('/:id/notification', async (req, res) => {
    try {
        const { type } = req.body; // 'tenMin', 'fiveMin', or 'atTime'
        if (!['tenMin', 'fiveMin', 'atTime'].includes(type)) {
            return res.status(400).json({ message: 'type must be tenMin, fiveMin, or atTime' });
        }

        const reminder = await TaskReminder.findById(req.params.id);
        if (!reminder) return res.status(404).json({ message: 'Reminder not found' });

        reminder.notificationSent[type] = true;
        await reminder.save();

        res.json({ message: `Notification ${type} marked as sent` });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

export default router;
