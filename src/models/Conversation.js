import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  isGroup: {
    type: Boolean,
    default: false
  },
  groupName: {
    type: String,
    trim: true
  },
  groupAvatar: {
    type: String
  },
  groupAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  unreadCounts: {
    type: Map,
    of: Number,
    default: {}
  }
}, {
  timestamps: true
});

// Increment unread count for all participants except sender
conversationSchema.methods.incrementUnreadCount = function(senderId) {
  const senderIdStr = senderId.toString();
  
  this.participants.forEach(participantId => {
    const pIdStr = participantId.toString();
    if (pIdStr !== senderIdStr) {
      const currentCount = this.unreadCounts.get(pIdStr) || 0;
      this.unreadCounts.set(pIdStr, currentCount + 1);
    }
  });
};

// Reset unread count for a specific user
conversationSchema.methods.resetUnreadCount = function(userId) {
  this.unreadCounts.set(userId.toString(), 0);
};

// Virtual for getting unread count for specific user (if needed in JSON)
conversationSchema.methods.getUnreadCountForUser = function(userId) {
  return this.unreadCounts.get(userId.toString()) || 0;
};

// Ensure unreadCounts is initialized
conversationSchema.pre('save', async function() {
  if (!this.unreadCounts) {
    this.unreadCounts = new Map();
  }
});

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;