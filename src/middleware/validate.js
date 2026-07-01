import { validationResult } from 'express-validator';

/**
 * Run an array of express-validator chains, then return a 400 with the
 * collected messages if any failed. Usage: validate([ body('x').notEmpty() ])
 */
export const validate = (validations) => async (req, res, next) => {
  await Promise.all(validations.map((v) => v.run(req)));
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  res.status(400).json({
    message: errors.array().map((e) => e.msg).join(', '),
    errors: errors.array(),
  });
};

export default validate;
