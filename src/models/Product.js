import mongoose from 'mongoose';
import slugify from 'slugify';

/** Per-size stock so the storefront can show which sizes are available. */
const variantSchema = new mongoose.Schema(
  {
    size: { type: Number, required: true }, // EU sizing
    stock: { type: Number, required: true, default: 0, min: 0 },
  },
  { _id: false }
);

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String }, // Cloudinary id, for deletion
  },
  { _id: false }
);

const reviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String },
    verified: { type: Boolean, default: true }, // reviewer is a confirmed buyer
  },
  { timestamps: true }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    slug: { type: String, unique: true, index: true },
    brand: { type: String, required: [true, 'Brand is required'], index: true },
    category: {
      type: String,
      enum: ['Men', 'Women', 'Kids', 'Unisex'],
      default: 'Unisex',
      index: true,
    },
    description: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 }, // original price for "on sale" display
    colors: [{ type: String }],
    images: [imageSchema],
    variants: [variantSchema],
    tags: [{ type: String }],
    featured: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true },
    rating: { type: Number, default: 0 },
    numReviews: { type: Number, default: 0 },
    reviews: [reviewSchema],
  },
  { timestamps: true }
);

// Total stock across all sizes — virtual so it is always in sync.
productSchema.virtual('totalStock').get(function totalStock() {
  return (this.variants || []).reduce((sum, v) => sum + v.stock, 0);
});

productSchema.virtual('onSale').get(function onSale() {
  return Boolean(this.compareAtPrice && this.compareAtPrice > this.price);
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

// Text index powers the storefront search box.
productSchema.index({ name: 'text', brand: 'text', description: 'text', tags: 'text' });

// Keep the slug unique and in sync with the name.
productSchema.pre('save', function setSlug(next) {
  if (this.isModified('name') || !this.slug) {
    this.slug = `${slugify(this.name, { lower: true, strict: true })}-${this._id
      .toString()
      .slice(-5)}`;
  }
  next();
});

const Product = mongoose.model('Product', productSchema);
export default Product;
