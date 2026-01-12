
// src/routes/roomRoutes.js
import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { 
  createRoom, 
  getRooms, 
  getRoom, 
  joinRoom 
} from '../controllers/roomController.js';

const routerRoom = express.Router();

routerRoom.use(protect);

// Room routes
routerRoom.route('/')
  .get(getRooms)
  .post(createRoom);

routerRoom.route('/:id')
  .get(getRoom);

routerRoom.post('/:id/join', joinRoom);

export default routerRoom;