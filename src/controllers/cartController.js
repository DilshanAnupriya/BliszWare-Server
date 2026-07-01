import asyncHandler from 'express-async-handler';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';

/** Fetch (or lazily create) the current user's cart, with product refs populated. */
const getOrCreateCart = async (userId) => {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = await Cart.create({ user: userId, items: [] });
  return cart;
};

// @desc   Get the current user's cart
// @route  GET /api/cart
// @access Private
export const getCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  res.json({ cart });
});

// @desc   Add an item to the cart (or bump quantity if it already exists)
// @route  POST /api/cart/items
// @access Private
export const addItem = asyncHandler(async (req, res) => {
  const { productId, size, quantity = 1 } = req.body;

  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    res.status(404);
    throw new Error('Product not available');
  }

  const variant = product.variants.find((v) => v.size === Number(size));
  if (!variant || variant.stock < 1) {
    res.status(400);
    throw new Error('Selected size is out of stock');
  }

  const cart = await getOrCreateCart(req.user._id);
  const existing = cart.items.find(
    (i) => i.product.toString() === productId && i.size === Number(size)
  );

  const desiredQty = (existing?.quantity || 0) + Number(quantity);
  if (desiredQty > variant.stock) {
    res.status(400);
    throw new Error(`Only ${variant.stock} left in size ${size}`);
  }

  if (existing) {
    existing.quantity = desiredQty;
  } else {
    cart.items.push({
      product: product._id,
      name: product.name,
      image: product.images?.[0]?.url,
      brand: product.brand,
      price: product.price,
      size: Number(size),
      quantity: Number(quantity),
    });
  }

  await cart.save();
  res.status(201).json({ cart });
});

// @desc   Update an item's quantity
// @route  PUT /api/cart/items/:itemId
// @access Private
export const updateItem = asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const cart = await getOrCreateCart(req.user._id);
  const item = cart.items.id(req.params.itemId);
  if (!item) {
    res.status(404);
    throw new Error('Item not in cart');
  }

  if (Number(quantity) < 1) {
    item.deleteOne();
  } else {
    // Re-check stock before increasing.
    const product = await Product.findById(item.product);
    const variant = product?.variants.find((v) => v.size === item.size);
    if (variant && Number(quantity) > variant.stock) {
      res.status(400);
      throw new Error(`Only ${variant.stock} left in size ${item.size}`);
    }
    item.quantity = Number(quantity);
  }

  await cart.save();
  res.json({ cart });
});

// @desc   Remove an item
// @route  DELETE /api/cart/items/:itemId
// @access Private
export const removeItem = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  const item = cart.items.id(req.params.itemId);
  if (item) {
    item.deleteOne();
    await cart.save();
  }
  res.json({ cart });
});

// @desc   Empty the cart
// @route  DELETE /api/cart
// @access Private
export const clearCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  cart.items = [];
  await cart.save();
  res.json({ cart });
});

// @desc   Merge a guest cart (from localStorage) into the user's cart on login
// @route  POST /api/cart/merge
// @access Private
export const mergeCart = asyncHandler(async (req, res) => {
  const { items = [] } = req.body;
  const cart = await getOrCreateCart(req.user._id);

  for (const incoming of items) {
    const product = await Product.findById(incoming.product);
    if (!product || !product.isActive) continue;
    const variant = product.variants.find((v) => v.size === Number(incoming.size));
    if (!variant || variant.stock < 1) continue;

    const existing = cart.items.find(
      (i) => i.product.toString() === incoming.product && i.size === Number(incoming.size)
    );
    const qty = Math.min(
      (existing?.quantity || 0) + Number(incoming.quantity || 1),
      variant.stock
    );

    if (existing) {
      existing.quantity = qty;
    } else {
      cart.items.push({
        product: product._id,
        name: product.name,
        image: product.images?.[0]?.url,
        brand: product.brand,
        price: product.price,
        size: Number(incoming.size),
        quantity: qty,
      });
    }
  }

  await cart.save();
  res.json({ cart });
});
