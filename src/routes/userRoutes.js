//routes/userRoutes.js
import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import {
  getProfile,
  updateProfile,
  searchUsers,
  updateStatus
} from '../controllers/userController.js';

const router = express.Router();

router.use(protect);

// User routes
router.route('/profile')
  .get(getProfile)
  .put(updateProfile);

router.get('/search', searchUsers);
router.patch('/status', updateStatus);

export default router;
