const asyncHandler = require('../../utils/asyncHandler');
const authService = require('./auth.service');

const register = asyncHandler(async (req, res) => {
  const user = await authService.register(req.body);
  res.status(201).json({ success: true, data: user });
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  res.json({ success: true, ...result });
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getById(req.user.id);
  res.json({ success: true, data: user });
});

const updateMe = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.user.id, req.body);
  res.json({ success: true, data: user });
});

const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.id, req.body.current_password, req.body.new_password);
  res.json({ success: true, message: 'Password updated' });
});

const listUsers = asyncHandler(async (_req, res) => {
  const users = await authService.list();
  res.json({ success: true, data: users });
});

const setActive = asyncHandler(async (req, res) => {
  const user = await authService.setActive(req.params.id, req.body.is_active);
  res.json({ success: true, data: user });
});

module.exports = { register, login, me, updateMe, changePassword, listUsers, setActive };
