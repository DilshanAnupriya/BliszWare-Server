import mongoose from 'mongoose';

/** A customer testimonial shown on the storefront, managed from the admin panel. */
const testimonialSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    location: { type: String, trim: true, default: '' }, // e.g. "Colombo, Sri Lanka"
    text: { type: String, required: [true, 'Testimonial text is required'], trim: true },
    rating: { type: Number, min: 1, max: 5, default: 5 },
    avatar: { type: String }, // optional image URL; falls back to an initial
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 }, // lower shows first
    // Moderation: user submissions start 'pending'; admins approve before they show.
    status: { type: String, enum: ['pending', 'approved'], default: 'pending' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // set for user submissions
  },
  { timestamps: true }
);

const Testimonial = mongoose.model('Testimonial', testimonialSchema);
export default Testimonial;
