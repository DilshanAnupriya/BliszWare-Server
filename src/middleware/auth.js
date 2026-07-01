import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';

/**
 * Require a valid JWT. Accepts either an `Authorization: Bearer <token>`
 * header or an httpOnly `token` cookie. Attaches the user to `req.user`.
 */
export const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorised — no token provided');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) {
      res.status(401);
      throw new Error('Not authorised — user no longer exists');
    }
    next();
  } catch (err) {
    res.status(401);
    throw new Error('Not authorised — token failed');
  }
});

/** Roles allowed into the admin panel. */
export const ADMIN_ROLES = ['admin', 'superadmin'];

/** Require the authenticated user to be an admin (or super admin). Use after `protect`. */
export const admin = (req, res, next) => {
  if (req.user && ADMIN_ROLES.includes(req.user.role)) return next();
  res.status(403);
  throw new Error('Admin access only');
};

/** Require the authenticated user to be a super admin. Use after `protect`. */
export const superAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'superadmin') return next();
  res.status(403);
  throw new Error('Super admin access only');
};

/**
 * Optional auth — attaches the user if a valid token is present, but never
 * blocks the request. Handy for guest-friendly endpoints like the cart.
 */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
    } catch {
      /* ignore invalid token for optional auth */
    }
  }
  next();
});
