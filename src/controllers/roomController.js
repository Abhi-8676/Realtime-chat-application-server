import Room from '../models/Room.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/AppError.js';

export const createRoom = catchAsync(async (req, res, next) => {
  const { name, description, isPrivate, category } = req.body;

  if (!name || name.trim().length < 3) {
    return next(new AppError('Room name must be at least 3 characters long', 400));
  }

  const existingRoom = await Room.findOne({ name: name.trim() });
  if (existingRoom) {
    return next(new AppError('Room with this name already exists', 400));
  }

  let room = await Room.create({
    name,
    description,
    isPrivate: isPrivate || false,
    category: category || 'general',
    owner: req.user._id,
    members: [req.user._id]
  });

  // Populate owner details
  room = await room.populate('owner', 'username avatar');

  // Emit socket event for real-time update
  const io = req.app.get('io');
  if (io && !isPrivate) {
    io.emit('room:new', { room });
  }

  res.status(201).json({
    status: 'success',
    data: { room }
  });
});

export const getRooms = catchAsync(async (req, res, next) => {
  const rooms = await Room.find({
    $or: [
      { isPrivate: false },
      { members: req.user._id }
    ]
  })
  .populate('owner', 'username avatar')
  .sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: rooms.length,
    data: { rooms }
  });
});

export const getRoom = catchAsync(async (req, res, next) => {
  const room = await Room.findById(req.params.id)
    .populate('owner', 'username avatar')
    .populate('members', 'username avatar');

  if (!room) {
    return next(new AppError('Room not found', 404));
  }

  if (room.isPrivate && !room.isMember(req.user._id)) {
    return next(new AppError('You do not have access to this room', 403));
  }

  res.status(200).json({
    status: 'success',
    data: { room }
  });
});

export const joinRoom = catchAsync(async (req, res, next) => {
  const room = await Room.findById(req.params.id);

  if (!room) {
    return next(new AppError('Room not found', 404));
  }

  if (room.isPrivate) {
    return next(new AppError('Cannot join private room directly', 403));
  }

  if (room.isMember(req.user._id)) {
    return next(new AppError('You are already a member of this room', 400));
  }

  room.members.push(req.user._id);
  await room.save();

  // Populate for response
  await room.populate('owner', 'username avatar');
  await room.populate('members', 'username avatar');

  // Emit socket event
  const io = req.app.get('io');
  if (io) {
    io.to(`room:${room._id}`).emit('room:user-joined', {
      userId: req.user._id,
      username: req.user.username,
      roomId: room._id
    });
  }

  res.status(200).json({
    status: 'success',
    message: 'Joined room successfully',
    data: { room }
  });
});