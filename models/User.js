import mongoose from 'mongoose';

const userSchema = mongoose.Schema({
    phoneNumber: {
        type: String,
        required: false, // allow email-only login
        unique: true,
        sparse: true   // ensure unique skip for nulls
    },
    email: {
        type: String,
        required: false,
        unique: true,
        sparse: true,
        lowercase: true,
        trim: true
    },
    name: {
        type: String,
        default: "Guest Farmer"
    },
    role: {
        type: String,
        enum: ['farmer', 'expert', 'guest'],
        default: 'farmer'
    },
    profileImage: {
        type: String,
        default: ""
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const User = mongoose.model('User', userSchema);

export default User;
