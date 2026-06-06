import bcrypt from 'bcryptjs';
import { Response } from 'express';
import User from '../models/User';
import { AuthRequest, generateToken } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';

const sendTokenResponse = (user: InstanceType<typeof User>, statusCode: number, res: Response) => {
  const token = generateToken(user._id.toString());
  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      addresses: user.addresses,
      avatar: user.avatar,
    },
  });
};

export const register = catchAsync(async (req: AuthRequest, res: Response) => {
  const { name, email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError('Email already registered', 400);
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email, password: hashedPassword });

  sendTokenResponse(user, 201, res);
});

export const login = catchAsync(async (req: AuthRequest, res: Response) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new AppError('Invalid email or password', 401);
  }

  sendTokenResponse(user, 200, res);
});

export const getMe = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!._id);
  res.json({ success: true, user });
});

export const updateProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const { name, phone } = req.body;
  const user = await User.findByIdAndUpdate(
    req.user!._id,
    { name, phone },
    { new: true, runValidators: true }
  );
  res.json({ success: true, user });
});

export const addAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!._id);
  if (!user) throw new AppError('User not found', 404);

  if (req.body.isDefault) {
    user.addresses.forEach((addr) => { addr.isDefault = false; });
  }

  user.addresses.push(req.body);
  await user.save();
  res.json({ success: true, user });
});

export const updateAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!._id);
  if (!user) throw new AppError('User not found', 404);

  const address = user.addresses.find((a) => a._id?.toString() === req.params.addressId);
  if (!address) throw new AppError('Address not found', 404);

  if (req.body.isDefault) {
    user.addresses.forEach((addr) => { addr.isDefault = false; });
  }

  Object.assign(address, req.body);
  await user.save();
  res.json({ success: true, user });
});

export const deleteAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!._id);
  if (!user) throw new AppError('User not found', 404);

  const addressIndex = user.addresses.findIndex((a) => a._id?.toString() === req.params.addressId);
  if (addressIndex === -1) throw new AppError('Address not found', 404);

  user.addresses.splice(addressIndex, 1);
  await user.save();
  res.json({ success: true, user });
});

export const getAllUsers = catchAsync(async (_req: AuthRequest, res: Response) => {
  const users = await User.find({ role: 'customer' }).select('-password').sort({ createdAt: -1 });
  res.json({ success: true, users, count: users.length });
});

export const getUserById = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.params.id).select('-password');
  if (!user) throw new AppError('User not found', 404);
  res.json({ success: true, user });
});
