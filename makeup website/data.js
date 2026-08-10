/* =========================================================
   VELOUR — Data Layer (Supabase-backed)
   Same DB.* function names as before, so ui.js barely had to
   change — but every function is now async (it talks to a real
   database over the network) and every call site must `await` it.
   Requires supabase-config.js to run first (defines `sb`).
   ========================================================= */

const ICON_PATHS = {
  lips: '<path d="M4 14c2-4 6-6 8-6s6 2 8 6c-2 3-5 5-8 5s-6-2-8-5z"/>',
  face: '<circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01M8 15c1.5 1.5 6.5 1.5 8 0"/>',
  eyes: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.4"/>',
  skin: '<path d="M12 2c-2 3-4 6-4 9a4 4 0 0 0 8 0c0-3-2-6-4-9z"/>',
};

function mapProductRow(p) {
  return {
    id: p.id, name: p.name, category: p.category, price: Number(p.price),
    shades: p.shades || [], desc: p.description, colorFrom: p.color_from,
    colorTo: p.color_to, icon: p.icon,
  };
}

const LS = {
  get(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
  },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
};
const THEME_KEY = "velour_theme";

const DB = {

  /* ---------- Products ---------- */
  async getProducts() {
    const { data, error } = await sb.from("products").select("*").order("created_at");
    if (error) { console.error(error); return []; }
    return data.map(mapProductRow);
  },
  async getProduct(id) {
    const { data, error } = await sb.from("products").select("*").eq("id", id).maybeSingle();
    if (error || !data) return null;
    return mapProductRow(data);
  },
  async adminAddProduct(product) {
    const { error } = await sb.from("products").insert({
      id: product.id, name: product.name, category: product.category, price: product.price,
      shades: product.shades || [], description: product.desc,
      color_from: product.colorFrom, color_to: product.colorTo, icon: product.icon,
    });
    if (error) console.error(error);
  },
  async adminEditProduct(id, changes) {
    const patch = {};
    if (changes.price !== undefined) patch.price = changes.price;
    if (changes.name !== undefined) patch.name = changes.name;
    if (changes.desc !== undefined) patch.description = changes.desc;
    const { error } = await sb.from("products").update(patch).eq("id", id);
    if (error) console.error(error);
  },
  async adminDeleteProduct(id) {
    const { error } = await sb.from("products").delete().eq("id", id);
    if (error) console.error(error);
  },

  /* ---------- Auth ---------- */
  async registerUser({ name, email, password }) {
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } });
    if (error) return { error: error.message };
    if (!data.session) {
      return { error: "Account created — check your email to confirm, then log in. (For a quick demo, turn off 'Confirm email' in Supabase Auth settings.)" };
    }
    const user = await this.currentUser();
    return { user };
  },
  async login(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    const user = await this.currentUser();
    return { user };
  },
  async logout() { await sb.auth.signOut(); },
  async currentUser() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
    return {
      id: user.id, email: user.email,
      name: profile?.name || user.email,
      isAdmin: !!profile?.is_admin,
    };
  },

  /* ---------- Cart ---------- */
  async getCart() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return [];
    const { data, error } = await sb.from("cart_items").select("*").eq("user_id", user.id);
    if (error) { console.error(error); return []; }
    return data.map((row) => ({ id: row.id, productId: row.product_id, shade: row.shade, qty: row.qty }));
  },
  async addToCart(productId, shade, qty = 1) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { alert("Please log in to add items to your bag."); return; }
    const { data: existing } = await sb.from("cart_items").select("*")
      .eq("user_id", user.id).eq("product_id", productId).eq("shade", shade || "").maybeSingle();
    if (existing) {
      await sb.from("cart_items").update({ qty: existing.qty + qty }).eq("id", existing.id);
    } else {
      await sb.from("cart_items").insert({ user_id: user.id, product_id: productId, shade: shade || null, qty });
    }
  },
  async updateCartQty(lineId, qty) {
    if (qty <= 0) return this.removeFromCart(lineId);
    await sb.from("cart_items").update({ qty }).eq("id", lineId);
  },
  async removeFromCart(lineId) {
    await sb.from("cart_items").delete().eq("id", lineId);
  },
  async clearCart() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    await sb.from("cart_items").delete().eq("user_id", user.id);
  },
  async cartCount() {
    const cart = await this.getCart();
    return cart.reduce((sum, l) => sum + l.qty, 0);
  },
  async cartTotal() {
    const [cart, products] = await Promise.all([this.getCart(), this.getProducts()]);
    return cart.reduce((sum, l) => {
      const p = products.find((p) => p.id === l.productId);
      return sum + (p ? p.price * l.qty : 0);
    }, 0);
  },

  /* ---------- Wishlist ---------- */
  async getWishlist() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return [];
    const { data, error } = await sb.from("wishlist_items").select("product_id").eq("user_id", user.id);
    if (error) { console.error(error); return []; }
    return data.map((r) => r.product_id);
  },
  async toggleWishlist(productId) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { alert("Please log in to save items to your wishlist."); return false; }
    const { data: existing } = await sb.from("wishlist_items").select("id")
      .eq("user_id", user.id).eq("product_id", productId).maybeSingle();
    if (existing) {
      await sb.from("wishlist_items").delete().eq("id", existing.id);
      return false;
    }
    await sb.from("wishlist_items").insert({ user_id: user.id, product_id: productId });
    return true;
  },
  async isWishlisted(productId) {
    const list = await this.getWishlist();
    return list.includes(productId);
  },

  /* ---------- Reviews ---------- */
  async getReviews(productId) {
    const { data, error } = await sb.from("reviews").select("*")
      .eq("product_id", productId).order("created_at", { ascending: false });
    if (error) { console.error(error); return []; }
    return data.map((r) => ({ name: r.user_name, rating: r.rating, text: r.text, date: r.created_at }));
  },
  async addReview(productId, { name, rating, text }) {
    const { error } = await sb.from("reviews").insert({ product_id: productId, user_name: name, rating, text });
    if (error) alert(error.message.includes("row-level") ? "Please log in to post a review." : error.message);
  },
  async avgRating(productId) {
    const reviews = await this.getReviews(productId);
    if (!reviews.length) return null;
    return reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  },

  /* ---------- Orders ---------- */
  async placeOrder(userId, shipping) {
    const [cart, products] = await Promise.all([this.getCart(), this.getProducts()]);
    const total = cart.reduce((sum, l) => {
      const p = products.find((p) => p.id === l.productId);
      return sum + (p ? p.price * l.qty : 0);
    }, 0);
    const id = "VLR-" + Date.now().toString().slice(-6);
    const items = cart.map((l) => ({ productId: l.productId, shade: l.shade, qty: l.qty }));
    const { error } = await sb.from("orders").insert({ id, user_id: userId, shipping, items, total, status: "Confirmed" });
    if (error) { console.error(error); throw error; }
    await this.clearCart();
    return { id, total, items, status: "Confirmed", date: new Date().toISOString() };
  },
  async getOrders(userId) {
    const { data, error } = await sb.from("orders").select("*")
      .eq("user_id", userId).order("created_at", { ascending: false });
    if (error) { console.error(error); return []; }
    return data.map((o) => ({ id: o.id, items: o.items, total: Number(o.total), status: o.status, date: o.created_at }));
  },

  /* ---------- Appointments ---------- */
  async addAppointment(appt) {
    const { error } = await sb.from("appointments").insert({
      name: appt.name, service: appt.service, date: appt.date || null, time: appt.time || null,
      email: appt.email, phone: appt.phone, notes: appt.notes,
    });
    if (error) console.error(error);
  },
  async getAppointments() {
    const { data, error } = await sb.from("appointments").select("*").order("created_at", { ascending: false });
    if (error) { console.error(error); return []; }
    return data.map((a) => ({ id: a.id, name: a.name, service: a.service, date: a.date, time: a.time, email: a.email, phone: a.phone, notes: a.notes }));
  },

  /* ---------- Theme (stays local — a device preference, not data) ---------- */
  getTheme() { return LS.get(THEME_KEY, "noir"); },
  setTheme(theme) { LS.set(THEME_KEY, theme); },
};
