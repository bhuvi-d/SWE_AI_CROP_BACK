import express from 'express';
import CommunityPost from '../models/CommunityPost.js';
import User from '../models/User.js';

const router = express.Router();

// Get all posts
router.get('/', async (req, res) => {
    try {
        const posts = await CommunityPost.find()
            .populate('user', 'name profileImage')
            .populate('comments.user', 'name profileImage')
            .sort({ createdAt: -1 });
        res.json(posts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get hot words (trending topics)
router.get('/hot-words', async (req, res) => {
    try {
        const posts = await CommunityPost.find().select('title content');
        const text = posts.map(p => `${p.title} ${p.content}`).join(' ').toLowerCase();
        
        // Simple stop words filter
        const stopWords = new Set(['the', 'and', 'a', 'to', 'is', 'in', 'it', 'of', 'for', 'with', 'on', 'at', 'by', 'an', 'be', 'this', 'that', 'from', 'as', 'are', 'was', 'my', 'your', 'i', 'you', 'how', 'what', 'can', 'do', 'any', 'my', 'me', 'our', 'we', 'they', 'them', 'he', 'she', 'it', 'his', 'her', 'its']);
        
        const words = text.match(/\b\w{3,}\b/g) || []; // only words with 3+ chars
        const freqMap = {};
        
        words.forEach(word => {
            if (!stopWords.has(word)) {
                freqMap[word] = (freqMap[word] || 0) + 1;
            }
        });
        
        const hotWords = Object.entries(freqMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word]) => word);
            
        res.json(hotWords);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create a post
router.post('/', async (req, res) => {
    const { userId, title, content, type, image } = req.body;
    try {
        const post = await CommunityPost.create({
            user: userId,
            title,
            content,
            type,
            image
        });
        const fullPost = await CommunityPost.findById(post._id).populate('user', 'name profileImage');
        res.status(201).json(fullPost);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Like a post
router.put('/:id/like', async (req, res) => {
    const { userId } = req.body;
    try {
        const post = await CommunityPost.findById(req.params.id);
        if (!post) return res.status(404).json({ message: 'Post not found' });

        if (post.likes.includes(userId)) {
            post.likes = post.likes.filter(id => id.toString() !== userId);
        } else {
            post.likes.push(userId);
        }
        await post.save();
        res.json(post.likes);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Add a comment
router.post('/:id/comment', async (req, res) => {
    const { userId, text } = req.body;
    try {
        const post = await CommunityPost.findById(req.params.id);
        if (!post) return res.status(404).json({ message: 'Post not found' });

        const comment = { user: userId, text };
        post.comments.push(comment);
        await post.save();

        // Return full post to refresh UI
        const fullPost = await CommunityPost.findById(req.params.id)
            .populate('user', 'name profileImage')
            .populate('comments.user', 'name profileImage');

        res.json(fullPost);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

export default router;
