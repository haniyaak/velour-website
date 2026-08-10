/* =========================================================
   VELOUR — UI Layer (async, runs on top of data.js + Supabase)
   ========================================================= */

function swatchSVG(icon, stroke) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.2">${ICON_PATHS[icon] || ""}</svg>`;
}

function starRow(rating, size = 14) {
  const full = Math.round(rating || 0);
  let out = "";
  for (let i = 1; i <= 5; i++) {
    out += `<svg width="${size}" height="${size}" viewBox="0 0 20 20" style="fill:${i <= full ? "var(--gold-400)" : "rgba(212,175,106,0.25)"}"><polygon points="10,1 12.6,7 19,7.6 14.2,12 15.6,18.5 10,15.2 4.4,18.5 5.8,12 1,7.6 7.4,7"/></svg>`;
  }
  return `<span style="display:inline-flex;gap:2px">${out}</span>`;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str == null ? "" : String(str);
  return d.innerHTML;
}

/* ---------- Nav: auth state + cart badge ---------- */
async function paintNavState() {
  const user = await DB.currentUser();
  const authSlot = document.getElementById("nav-auth-slot");
  if (authSlot) {
    authSlot.innerHTML = user
      ? `<a href="account.html">${user.isAdmin ? "Admin" : "Account"}</a>`
      : `<a href="login.html">Login</a>`;
  }
  const cartCount = document.getElementById("cart-count");
  if (cartCount) {
    const n = user ? await DB.cartCount() : 0;
    cartCount.textContent = n;
    cartCount.style.display = n > 0 ? "flex" : "none";
  }
  const adminLink = document.getElementById("nav-admin-link");
  if (adminLink) adminLink.style.display = user && user.isAdmin ? "" : "none";
}

/* ---------- Theme toggle (stays synchronous/local) ---------- */
function initTheme() {
  const saved = DB.getTheme();
  document.documentElement.setAttribute("data-theme", saved);
  const toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.checked = saved === "blanc";
    toggle.addEventListener("change", () => {
      const theme = toggle.checked ? "blanc" : "noir";
      document.documentElement.setAttribute("data-theme", theme);
      DB.setTheme(theme);
    });
  }
}

/* ---------- Product grid (products.html) ---------- */
async function initProductGrid() {
  const grid = document.getElementById("product-grid");
  if (!grid) return;

  const searchInput = document.getElementById("search-input");
  const filterBtns = document.querySelectorAll(".filter-btn");
  const priceRange = document.getElementById("price-range");
  const priceLabel = document.getElementById("price-range-label");
  const shadeSelect = document.getElementById("shade-select");

  let activeCategory = "all";
  const allProducts = await DB.getProducts();

  const shades = new Set();
  allProducts.forEach((p) => (p.shades || []).forEach((s) => shades.add(s)));
  if (shadeSelect) {
    shadeSelect.innerHTML = `<option value="">Any shade</option>` +
      [...shades].sort().map((s) => `<option value="${s}">${s}</option>`).join("");
  }

  async function cardHTML(p) {
    const [avg, wished] = await Promise.all([DB.avgRating(p.id), DB.isWishlisted(p.id)]);
    const reviewCount = avg ? (await DB.getReviews(p.id)).length : 0;
    return `
    <div class="product-card" data-category="${p.category}">
      <a href="product.html?id=${p.id}" style="display:block">
        <div class="product-swatch" style="background:linear-gradient(160deg,${p.colorFrom},${p.colorTo})">
          ${swatchSVG(p.icon, "#F5EBDD")}
          <button class="wish-btn ${wished ? "wished" : ""}" data-wish="${p.id}" title="Save to wishlist" onclick="event.preventDefault()">&hearts;</button>
        </div>
      </a>
      <div class="product-body">
        <span class="product-cat">${p.category}</span>
        <a href="product.html?id=${p.id}"><h3>${p.name}</h3></a>
        ${avg ? `<div style="margin-bottom:8px">${starRow(avg)} <span class="muted" style="font-size:.78rem">(${reviewCount})</span></div>` : ""}
        <p>${p.desc}</p>
        <div class="product-foot">
          <span class="price">$${p.price}</span>
          <button class="add-btn" data-add="${p.id}">Add to Bag</button>
        </div>
      </div>
    </div>`;
  }

  async function render() {
    const query = (searchInput?.value || "").toLowerCase().trim();
    const maxPrice = priceRange ? Number(priceRange.value) : 999;
    const shade = shadeSelect?.value || "";
    if (priceLabel) priceLabel.textContent = "$" + maxPrice;

    const filtered = allProducts.filter((p) => {
      if (activeCategory !== "all" && p.category !== activeCategory) return false;
      if (p.price > maxPrice) return false;
      if (shade && !(p.shades || []).includes(shade)) return false;
      if (query && !(p.name.toLowerCase().includes(query) || p.desc.toLowerCase().includes(query))) return false;
      return true;
    });

    grid.innerHTML = `<p class="muted" style="grid-column:1/-1;text-align:center;padding:20px 0">Loading…</p>`;
    const cards = await Promise.all(filtered.map(cardHTML));
    grid.innerHTML = cards.length ? cards.join("") : `
      <p class="muted" style="grid-column:1/-1;text-align:center;padding:40px 0">
        No products match those filters — try widening your search.
      </p>`;

    grid.querySelectorAll("[data-add]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        await DB.addToCart(btn.dataset.add, null, 1);
        await paintNavState();
        btn.textContent = "Added ✓";
        setTimeout(() => (btn.textContent = "Add to Bag"), 1200);
      });
    });
    grid.querySelectorAll("[data-wish]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const on = await DB.toggleWishlist(btn.dataset.wish);
        btn.classList.toggle("wished", on);
      });
    });
  }

  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeCategory = btn.dataset.filter;
      render();
    });
  });
  searchInput?.addEventListener("input", render);
  priceRange?.addEventListener("input", render);
  shadeSelect?.addEventListener("change", render);

  render();
}

/* ---------- Product detail (product.html) ---------- */
async function initProductDetail() {
  const root = document.getElementById("product-detail");
  if (!root) return;
  const id = new URLSearchParams(location.search).get("id");
  const p = await DB.getProduct(id);
  if (!p) {
    root.innerHTML = `<p>Product not found. <a href="products.html" style="color:var(--gold-300)">Back to shop</a></p>`;
    return;
  }
  document.title = p.name + " — Velour";

  const wished = await DB.isWishlisted(p.id);
  const shadeOptions = (p.shades || []).map((s) => `<option value="${s}">${s}</option>`).join("");
  root.innerHTML = `
    <div class="pd-grid">
      <div class="product-swatch pd-swatch" style="background:linear-gradient(160deg,${p.colorFrom},${p.colorTo})">
        ${swatchSVG(p.icon, "#F5EBDD")}
      </div>
      <div class="pd-info">
        <span class="product-cat">${p.category}</span>
        <h1 style="font-size:2.2rem;margin:10px 0">${p.name}</h1>
        <div id="pd-rating" style="margin-bottom:14px"></div>
        <p class="price" style="font-size:1.6rem">$${p.price}</p>
        <p style="margin:18px 0">${p.desc}</p>
        ${p.shades && p.shades.length ? `
          <div class="field">
            <label for="pd-shade">Shade</label>
            <select id="pd-shade">${shadeOptions}</select>
          </div>` : ""}
        <div class="hero-actions" style="margin-top:20px">
          <button id="pd-add" class="btn btn-solid">Add to Bag</button>
          <button id="pd-wish" class="btn btn-ghost">${wished ? "♥ Saved" : "♡ Save to Wishlist"}</button>
        </div>
      </div>
    </div>

    <div class="pour" aria-hidden="true">
      <svg viewBox="0 0 220 24"><line class="pour-line" x1="10" y1="12" x2="210" y2="12"/><circle class="pour-drop" cx="210" cy="12" r="3"/></svg>
    </div>

    <div class="reviews-block">
      <h3 style="margin-bottom:18px">Reviews</h3>
      <div id="pd-reviews">Loading…</div>
      <form id="review-form" class="form-card" style="margin-top:26px;max-width:520px">
        <div class="field"><label for="rv-name">Name</label><input id="rv-name" required placeholder="Your name"></div>
        <div class="field"><label for="rv-rating">Rating</label>
          <select id="rv-rating"><option value="5">5 — Loved it</option><option value="4">4 — Great</option><option value="3">3 — Good</option><option value="2">2 — Okay</option><option value="1">1 — Not for me</option></select>
        </div>
        <div class="field"><label for="rv-text">Review</label><textarea id="rv-text" rows="3" required placeholder="Tell us how it wore…"></textarea></div>
        <button type="submit" class="btn btn-solid" style="border:none">Post Review</button>
      </form>
    </div>
  `;

  async function renderRating() {
    const [avg, reviews] = await Promise.all([DB.avgRating(p.id), DB.getReviews(p.id)]);
    document.getElementById("pd-rating").innerHTML = avg
      ? `${starRow(avg, 16)} <span class="muted">${avg.toFixed(1)} · ${reviews.length} review${reviews.length > 1 ? "s" : ""}</span>`
      : `<span class="muted">No reviews yet — be the first.</span>`;
  }
  async function renderReviews() {
    const reviews = await DB.getReviews(p.id);
    document.getElementById("pd-reviews").innerHTML = reviews.length
      ? reviews.map((r) => `
        <div style="border-bottom:1px solid rgba(212,175,106,0.15);padding:14px 0">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong style="font-family:var(--font-label);font-size:.8rem;letter-spacing:.06em">${escapeHtml(r.name)}</strong>
            ${starRow(r.rating, 13)}
          </div>
          <p style="margin:6px 0 0;font-size:.9rem">${escapeHtml(r.text)}</p>
        </div>`).join("")
      : `<p class="muted">No reviews yet.</p>`;
  }
  await Promise.all([renderRating(), renderReviews()]);

  document.getElementById("pd-add").addEventListener("click", async () => {
    const shadeEl = document.getElementById("pd-shade");
    await DB.addToCart(p.id, shadeEl ? shadeEl.value : null, 1);
    await paintNavState();
    const btn = document.getElementById("pd-add");
    btn.textContent = "Added ✓";
    setTimeout(() => (btn.textContent = "Add to Bag"), 1200);
  });
  document.getElementById("pd-wish").addEventListener("click", async () => {
    const on = await DB.toggleWishlist(p.id);
    document.getElementById("pd-wish").textContent = on ? "♥ Saved" : "♡ Save to Wishlist";
  });
  document.getElementById("review-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await DB.addReview(p.id, {
      name: document.getElementById("rv-name").value.trim() || "Anonymous",
      rating: Number(document.getElementById("rv-rating").value),
      text: document.getElementById("rv-text").value.trim(),
    });
    e.target.reset();
    await renderRating();
    await renderReviews();
  });
}

/* ---------- Cart page ---------- */
async function initCartPage() {
  const root = document.getElementById("cart-root");
  if (!root) return;

  async function render() {
    root.innerHTML = `<p class="muted">Loading your bag…</p>`;
    const [cart, products] = await Promise.all([DB.getCart(), DB.getProducts()]);
    document.getElementById("cart-summary")?.remove();

    if (!cart.length) {
      root.innerHTML = `<p class="muted" style="text-align:center;padding:40px 0">Your bag is empty. <a href="products.html" style="color:var(--gold-300)">Browse the collection →</a></p>`;
      return;
    }

    root.innerHTML = `
      <table class="cart-table">
        <thead><tr><th>Product</th><th>Shade</th><th>Qty</th><th>Price</th><th></th></tr></thead>
        <tbody>
          ${cart.map((line) => {
            const p = products.find((p) => p.id === line.productId);
            if (!p) return "";
            return `<tr>
              <td>
                <div style="display:flex;align-items:center;gap:12px">
                  <div class="product-swatch" style="width:52px;height:52px;background:linear-gradient(160deg,${p.colorFrom},${p.colorTo})">${swatchSVG(p.icon, "#F5EBDD")}</div>
                  <a href="product.html?id=${p.id}" style="color:var(--cream-100)">${p.name}</a>
                </div>
              </td>
              <td>${line.shade || "—"}</td>
              <td><input type="number" min="1" value="${line.qty}" data-qty="${line.id}" style="width:60px;background:rgba(21,5,8,0.4);border:1px solid rgba(212,175,106,0.3);color:var(--cream-100);padding:6px;border-radius:2px"></td>
              <td>$${(p.price * line.qty).toFixed(2)}</td>
              <td><button data-remove="${line.id}" class="chat-close" style="font-size:1.3rem">&times;</button></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>`;

    root.querySelectorAll("[data-qty]").forEach((inp) => {
      inp.addEventListener("change", async () => {
        await DB.updateCartQty(inp.dataset.qty, Number(inp.value));
        await paintNavState();
        render();
      });
    });
    root.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await DB.removeFromCart(btn.dataset.remove);
        await paintNavState();
        render();
      });
    });

    const total = cart.reduce((sum, l) => {
      const p = products.find((p) => p.id === l.productId);
      return sum + (p ? p.price * l.qty : 0);
    }, 0);
    const summary = document.createElement("div");
    summary.id = "cart-summary";
    summary.className = "form-card";
    summary.style.maxWidth = "360px";
    summary.style.marginLeft = "auto";
    summary.style.marginTop = "30px";
    summary.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:14px">
        <span class="muted">Subtotal</span><span class="price">$${total.toFixed(2)}</span>
      </div>
      <a href="checkout.html" class="btn btn-solid" style="display:block;text-align:center">Proceed to Checkout</a>`;
    root.after(summary);
  }
  render();
}

/* ---------- Checkout page ---------- */
async function initCheckoutPage() {
  const form = document.getElementById("checkout-form");
  if (!form) return;

  const user = await DB.currentUser();
  if (!user) {
    form.closest(".form-card").innerHTML = `<p class="muted">Please <a href="login.html" style="color:var(--gold-300)">log in</a> to check out.</p>`;
    return;
  }

  const cart = await DB.getCart();
  const totalEl = document.getElementById("checkout-total");
  if (totalEl) totalEl.textContent = "$" + (await DB.cartTotal()).toFixed(2);

  if (!cart.length) {
    form.closest(".form-card").innerHTML = `<p class="muted">Your bag is empty. <a href="products.html" style="color:var(--gold-300)">Browse the collection →</a></p>`;
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("co-name").value.trim();
    const address = document.getElementById("co-address").value.trim();
    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Placing order…";

    try {
      const order = await DB.placeOrder(user.id, { name, address });
      await paintNavState();
      document.getElementById("checkout-confirm").innerHTML = `
        <strong style="color:var(--gold-300)">Order ${order.id} confirmed.</strong><br>
        Thank you, ${escapeHtml(name)} — a receipt would normally be emailed here. (No real payment was processed; this is a demo checkout.)`;
      document.getElementById("checkout-confirm").classList.add("show");
      form.reset();
      form.style.display = "none";
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Place Order";
      alert("Something went wrong placing your order. Please try again.");
    }
  });
}

/* ---------- Account page ---------- */
async function initAccountPage() {
  const root = document.getElementById("account-root");
  if (!root) return;
  const user = await DB.currentUser();
  if (!user) { location.href = "login.html"; return; }

  root.innerHTML = `<p class="muted">Loading your account…</p>`;
  const orders = await DB.getOrders(user.id);
  root.innerHTML = `
    <div class="section-head" style="text-align:left;max-width:none;margin-bottom:30px">
      <span class="eyebrow">Account</span>
      <h2 style="font-size:2rem">Welcome, ${escapeHtml(user.name)}</h2>
      <p class="muted">${escapeHtml(user.email)}</p>
    </div>
    <h3 style="margin-bottom:16px">Order History</h3>
    ${orders.length ? orders.map((o) => `
      <div class="form-card" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <strong style="font-family:var(--font-label);font-size:.8rem;letter-spacing:.08em;color:var(--gold-300)">${o.id}</strong>
          <span class="muted" style="font-size:.82rem">${new Date(o.date).toLocaleDateString()}</span>
        </div>
        <p class="muted" style="font-size:.85rem;margin:8px 0">${o.items.length} item${o.items.length > 1 ? "s" : ""} · ${escapeHtml(o.status)}</p>
        <p class="price">$${o.total.toFixed(2)}</p>
      </div>`).join("") : `<p class="muted">No orders yet. <a href="products.html" style="color:var(--gold-300)">Start shopping →</a></p>`}
    <button id="logout-btn" class="btn btn-ghost" style="margin-top:24px">Log Out</button>
  `;
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await DB.logout();
    location.href = "index.html";
  });
}

/* ---------- Wishlist page ---------- */
async function initWishlistPage() {
  const root = document.getElementById("wishlist-root");
  if (!root) return;
  root.innerHTML = `<p class="muted">Loading…</p>`;
  const ids = await DB.getWishlist();
  const products = (await Promise.all(ids.map((id) => DB.getProduct(id)))).filter(Boolean);
  root.innerHTML = products.length
    ? `<div class="product-grid">${products.map((p) => `
        <div class="product-card">
          <a href="product.html?id=${p.id}">
            <div class="product-swatch" style="background:linear-gradient(160deg,${p.colorFrom},${p.colorTo})">${swatchSVG(p.icon, "#F5EBDD")}</div>
          </a>
          <div class="product-body">
            <span class="product-cat">${p.category}</span>
            <a href="product.html?id=${p.id}"><h3>${p.name}</h3></a>
            <div class="product-foot"><span class="price">$${p.price}</span>
              <button class="add-btn" data-add="${p.id}">Add to Bag</button>
            </div>
          </div>
        </div>`).join("")}</div>`
    : `<p class="muted" style="text-align:center">Nothing saved yet. <a href="products.html" style="color:var(--gold-300)">Browse the collection →</a></p>`;

  root.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await DB.addToCart(btn.dataset.add, null, 1);
      await paintNavState();
      btn.textContent = "Added ✓";
    });
  });
}

/* ---------- Admin page ---------- */
async function initAdminPage() {
  const root = document.getElementById("admin-root");
  if (!root) return;
  const user = await DB.currentUser();
  if (!user || !user.isAdmin) {
    root.innerHTML = `<p class="muted">This area is for Velour staff only. <a href="login.html" style="color:var(--gold-300)">Log in with an admin account →</a></p>
      <p class="muted" style="font-size:.82rem;margin-top:10px">Demo tip: register using the email <strong>admin@velour.com</strong> to get admin access.</p>`;
    return;
  }

  async function renderProducts() {
    const products = await DB.getProducts();
    document.getElementById("admin-products").innerHTML = `
      <table class="cart-table">
        <thead><tr><th>Name</th><th>Category</th><th>Price</th><th></th></tr></thead>
        <tbody>
          ${products.map((p) => `
            <tr>
              <td>${escapeHtml(p.name)}</td>
              <td>${p.category}</td>
              <td><input type="number" data-price="${p.id}" value="${p.price}" style="width:70px;background:rgba(21,5,8,0.4);border:1px solid rgba(212,175,106,0.3);color:var(--cream-100);padding:6px;border-radius:2px"></td>
              <td><button class="chat-close" style="font-size:1.2rem" data-del="${p.id}">&times;</button></td>
            </tr>`).join("")}
        </tbody>
      </table>`;
    document.querySelectorAll("[data-price]").forEach((inp) => {
      inp.addEventListener("change", async () => {
        await DB.adminEditProduct(inp.dataset.price, { price: Number(inp.value) });
      });
    });
    document.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await DB.adminDeleteProduct(btn.dataset.del);
        renderProducts();
      });
    });
  }

  async function renderAppointments() {
    const appts = await DB.getAppointments();
    document.getElementById("admin-appts").innerHTML = appts.length ? `
      <table class="cart-table">
        <thead><tr><th>Name</th><th>Service</th><th>Date</th><th>Time</th><th>Contact</th></tr></thead>
        <tbody>
          ${appts.map((a) => `<tr><td>${escapeHtml(a.name)}</td><td>${escapeHtml(a.service)}</td><td>${escapeHtml(a.date || "—")}</td><td>${escapeHtml(a.time || "—")}</td><td>${escapeHtml(a.email)}</td></tr>`).join("")}
        </tbody>
      </table>` : `<p class="muted">No appointment requests yet.</p>`;
  }

  document.getElementById("admin-add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = "custom-" + Date.now();
    await DB.adminAddProduct({
      id, name: document.getElementById("ap-name").value.trim(),
      category: document.getElementById("ap-category").value,
      price: Number(document.getElementById("ap-price").value),
      shades: [], colorFrom: "#7A1830", colorTo: "#2B0512",
      desc: document.getElementById("ap-desc").value.trim(), icon: document.getElementById("ap-category").value,
    });
    e.target.reset();
    renderProducts();
  });

  await Promise.all([renderProducts(), renderAppointments()]);
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  paintNavState();
  initProductGrid();
  initProductDetail();
  initCartPage();
  initCheckoutPage();
  initAccountPage();
  initWishlistPage();
  initAdminPage();

  // Keep the nav (login state, cart badge) in sync if auth changes
  // in another tab, or right after login/logout in this one.
  if (typeof sb !== "undefined") {
    sb.auth.onAuthStateChange(() => paintNavState());
  }
});
