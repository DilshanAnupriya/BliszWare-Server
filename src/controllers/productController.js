import asyncHandler from 'express-async-handler';
import Product from '../models/Product.js';
import Order from '../models/Order.js';

/**
 * True if this user has a genuine purchase of the product: an order that
 * contains it and is either paid or already delivered.
 */
const hasPurchased = async (userId, productId) => {
  const order = await Order.findOne({
    user: userId,
    'items.product': productId,
    $or: [{ isPaid: true }, { status: 'Delivered' }],
  }).select('_id');
  return Boolean(order);
};

// @desc   List products with filtering, sorting, search & pagination
// @route  GET /api/products
// @access Public
export const getProducts = asyncHandler(async (req, res) => {
  const {
    brand,
    category,
    color,
    size,
    minPrice,
    maxPrice,
    search,
    sort = 'newest',
    page = 1,
    limit = 12,
    featured,
  } = req.query;

  const filter = { isActive: true };

  if (brand) filter.brand = { $in: brand.split(',') };
  if (category) filter.category = { $in: category.split(',') };
  if (color) filter.colors = { $in: color.split(',') };
  if (featured === 'true') filter.featured = true;
  if (size) filter['variants.size'] = { $in: size.split(',').map(Number) };

  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }

  if (search) filter.$text = { $search: search };

  const sortMap = {
    newest: { createdAt: -1 },
    priceAsc: { price: 1 },
    priceDesc: { price: -1 },
    rating: { rating: -1 },
    popular: { numReviews: -1 },
  };

  const pageNum = Math.max(1, Number(page));
  const perPage = Math.min(48, Number(limit));
  const skip = (pageNum - 1) * perPage;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .sort(sortMap[sort] || sortMap.newest)
      .skip(skip)
      .limit(perPage),
    Product.countDocuments(filter),
  ]);

  res.json({
    products,
    page: pageNum,
    pages: Math.ceil(total / perPage),
    total,
  });
});

// @desc   Distinct filter facets (brands, colors, sizes, price range)
// @route  GET /api/products/filters
// @access Public
export const getFilters = asyncHandler(async (req, res) => {
  const [brands, colors, sizes, priceRange] = await Promise.all([
    Product.distinct('brand', { isActive: true }),
    Product.distinct('colors', { isActive: true }),
    Product.distinct('variants.size', { isActive: true }),
    Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } },
    ]),
  ]);

  res.json({
    brands: brands.sort(),
    colors: colors.sort(),
    sizes: sizes.sort((a, b) => a - b),
    categories: ['Men', 'Women', 'Kids', 'Unisex'],
    priceRange: priceRange[0] || { min: 0, max: 50000 },
  });
});

// @desc   Featured products for the home page
// @route  GET /api/products/featured
// @access Public
export const getFeatured = asyncHandler(async (req, res) => {
  const products = await Product.find({ isActive: true, featured: true })
    .sort({ createdAt: -1 })
    .limit(8);
  res.json({ products });
});

// @desc   Get one product by slug or id
// @route  GET /api/products/:idOrSlug
// @access Public
export const getProduct = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const query = idOrSlug.match(/^[0-9a-fA-F]{24}$/)
    ? { _id: idOrSlug }
    : { slug: idOrSlug };

  const product = await Product.findOne(query);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // Lightweight "related" suggestions: same brand or category.
  const related = await Product.find({
    _id: { $ne: product._id },
    isActive: true,
    $or: [{ brand: product.brand }, { category: product.category }],
  })
    .limit(4)
    .select('name slug brand price compareAtPrice images rating');

  // Tell a logged-in user whether they're eligible to review.
  let canReview = false;
  let hasReviewed = false;
  if (req.user) {
    hasReviewed = product.reviews.some((r) => r.user.toString() === req.user._id.toString());
    canReview = !hasReviewed && (await hasPurchased(req.user._id, product._id));
  }

  res.json({ product, related, canReview, hasReviewed });
});

// @desc   Add a review to a product
// @route  POST /api/products/:id/reviews
// @access Private
export const addReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;
  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  const already = product.reviews.find(
    (r) => r.user.toString() === req.user._id.toString()
  );
  if (already) {
    res.status(400);
    throw new Error('You have already reviewed this product');
  }

  // Verified-purchase gate: only confirmed buyers may review.
  if (!(await hasPurchased(req.user._id, product._id))) {
    res.status(403);
    throw new Error('Only customers who purchased this product can review it');
  }

  product.reviews.push({
    user: req.user._id,
    name: req.user.name,
    rating: Number(rating),
    comment,
    verified: true,
  });
  product.numReviews = product.reviews.length;
  product.rating =
    product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.reviews.length;

  await product.save();
  res.status(201).json({ message: 'Review added', rating: product.rating });
});
