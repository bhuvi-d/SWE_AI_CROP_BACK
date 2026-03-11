import express from 'express';
import FarmTask from '../models/FarmTask.js';

const router = express.Router();

// ────────────────────────────────────────
// GET /api/farm-tasks/:userId
// Get all farm tasks for a user
// ────────────────────────────────────────
router.get('/:userId', async (req, res) => {
    try {
        const tasks = await FarmTask.find({ user: req.params.userId })
            .sort({ scheduledAt: 1 });
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ────────────────────────────────────────
// GET /api/farm-tasks/:userId/today
// Get today's tasks for a user
// ────────────────────────────────────────
router.get('/:userId/today', async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const tasks = await FarmTask.find({
            user: req.params.userId,
            scheduledAt: { $gte: startOfDay, $lte: endOfDay }
        }).sort({ scheduledAt: 1 });

        res.json(tasks);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ────────────────────────────────────────
// GET /api/farm-tasks/:userId/upcoming
// Get upcoming tasks (next 24 hours) for notification scheduling
// ────────────────────────────────────────
router.get('/:userId/upcoming', async (req, res) => {
    try {
        const now = new Date();
        const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        const tasks = await FarmTask.find({
            user: req.params.userId,
            scheduledAt: { $gte: now, $lte: next24h },
            status: 'pending'
        }).sort({ scheduledAt: 1 });

        res.json(tasks);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ────────────────────────────────────────
// POST /api/farm-tasks
// Create a new farm task (+ recurrence instances)
// ────────────────────────────────────────
router.post('/', async (req, res) => {
    const {
        userId, title, description, taskType, cropName,
        date, time, priority,
        isRecurring, recurrencePattern, recurrenceEndDate
    } = req.body;

    try {
        // Validate required fields
        if (!userId || !title || !date || !time) {
            return res.status(400).json({ message: 'userId, title, date, and time are required' });
        }

        // Create the main task
        const mainTask = await FarmTask.create({
            user: userId,
            title,
            description: description || '',
            taskType: taskType || 'other',
            cropName: cropName || '',
            date: new Date(date),
            time,
            priority: priority || 'medium',
            isRecurring: isRecurring || false,
            recurrencePattern: isRecurring ? (recurrencePattern || 'daily') : 'none',
            recurrenceEndDate: recurrenceEndDate ? new Date(recurrenceEndDate) : null
        });

        const createdTasks = [mainTask];

        // Generate recurrence instances if recurring
        if (isRecurring && recurrencePattern && recurrencePattern !== 'none') {
            const endDate = recurrenceEndDate
                ? new Date(recurrenceEndDate)
                : new Date(new Date(date).getTime() + 30 * 24 * 60 * 60 * 1000); // Default 30 days

            let currentDate = new Date(date);
            const incrementDays = {
                daily: 1,
                weekly: 7,
                biweekly: 14,
                monthly: 30
            };
            const increment = incrementDays[recurrencePattern] || 1;

            // Generate instances (skip the first one since we already created it)
            for (let i = 0; i < 365; i++) {
                currentDate = new Date(currentDate.getTime() + increment * 24 * 60 * 60 * 1000);
                if (currentDate > endDate) break;

                const instance = await FarmTask.create({
                    user: userId,
                    title,
                    description: description || '',
                    taskType: taskType || 'other',
                    cropName: cropName || '',
                    date: currentDate,
                    time,
                    priority: priority || 'medium',
                    isRecurring: true,
                    recurrencePattern,
                    parentTaskId: mainTask._id
                });
                createdTasks.push(instance);
            }
        }

        res.status(201).json({
            message: `Created ${createdTasks.length} task(s)`,
            tasks: createdTasks
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// ────────────────────────────────────────
// PUT /api/farm-tasks/:id/status
// Update task status (done / skipped / pending)
// ────────────────────────────────────────
router.put('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        if (!['pending', 'done', 'skipped', 'overdue'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status. Must be: pending, done, skipped, or overdue' });
        }

        const task = await FarmTask.findById(req.params.id);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        task.status = status;
        task.completedAt = status === 'done' ? new Date() : null;
        const updatedTask = await task.save();

        res.json(updatedTask);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// ────────────────────────────────────────
// PUT /api/farm-tasks/:id
// Edit task details
// ────────────────────────────────────────
router.put('/:id', async (req, res) => {
    try {
        const task = await FarmTask.findById(req.params.id);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        const allowedFields = ['title', 'description', 'taskType', 'cropName', 'date', 'time', 'priority'];
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                task[field] = field === 'date' ? new Date(req.body[field]) : req.body[field];
            }
        });

        const updatedTask = await task.save();
        res.json(updatedTask);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// ────────────────────────────────────────
// DELETE /api/farm-tasks/:id
// Delete a task (optionally delete all recurrence instances)
// ────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const task = await FarmTask.findById(req.params.id);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        // If deleteAll=true query param, delete all related recurring instances
        if (req.query.deleteAll === 'true' && task.parentTaskId) {
            await FarmTask.deleteMany({
                $or: [
                    { _id: task.parentTaskId },
                    { parentTaskId: task.parentTaskId },
                    { _id: task._id }
                ]
            });
            return res.json({ message: 'All recurring instances deleted' });
        }

        await task.deleteOne();
        res.json({ message: 'Task removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

export default router;
