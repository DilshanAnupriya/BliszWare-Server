import jwt from 'jsonwebtoken';

/** Sign a JWT carrying the user id and role. */
export const generateToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });

export default generateToken;
