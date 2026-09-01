// =========================================================
// Perfumería · Catálogo & Pedidos — Con Base de Datos Firebase en la Nube
// Precios Base en Bolívares (Bs.) y Conversión a Dólares con Tasa Oficial BCV
// Puntos configurables de Spread para Tasa Binance
// Sincronización en tiempo real para todos los clientes (Vercel & Web)
// =========================================================

// --- Configuración de Firebase del Proyecto ---
const firebaseConfig = {
  apiKey: "AIzaSyCqBaLupLTQU0c31eDyMihjVg7m1jmKcJ4",
  authDomain: "perfumeria-catalogo.firebaseapp.com",
  projectId: "perfumeria-catalogo",
  storageBucket: "perfumeria-catalogo.firebasestorage.app",
  messagingSenderId: "1087951328890",
  appId: "1:1087951328890:web:2b9fb445946d08c39c8dc3"
};

let db = null;
try {
  if (window.firebase) {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
  }
} catch (e) {
  console.warn("Firebase no se pudo inicializar:", e);
}

const PRESENTATIONS = [
  { key: "plastico35", label: "Plástico 35ml", ml: 35 },
  { key: "vidrio30", label: "Vidrio 30ml", ml: 30 },
  { key: "vidrio50", label: "Vidrio 50ml", ml: 50 },
  { key: "vidrio60", label: "Vidrio 60ml", ml: 60 },
];
const REFILL_SIZES = [
  { key: "refill30", label: "30ml", ml: 30 },
  { key: "refill35", label: "35ml", ml: 35 },
];
const VOLUME_QTY = 3;
const VOLUME_DISCOUNT = 0.2;
const MAX_IMG_BYTES = 3.5 * 1024 * 1024; // 3.5MB por imagen

const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='200' height='200' fill='#0f172a'/><path d='M100 40c14 22 34 44 34 70a34 34 0 1 1-68 0c0-26 20-48 34-70z' fill='#E5B869'/></svg>"
  );

const INITIAL_INVENTORY = [
  {
    id: "prod_royal_amber",
    nombre: "Orientica Royal Amber",
    imagen: "uploads/prod_orientica_royal_amber.jpg",
    stockMl: 500,
    precios: null
  },
  {
    id: "prod_212_vip_rose",
    nombre: "212 VIP Rosé (I ❤️ NY)",
    imagen: "uploads/prod_212_vip_rose.jpg",
    stockMl: 500,
    precios: null
  },
  {
    id: "prod_la_vie_est_belle",
    nombre: "Lancôme La Vie Est Belle",
    imagen: "uploads/prod_la_vie_est_belle.jpg",
    stockMl: 500,
    precios: null
  },
  {
    id: "prod_paris_hilton",
    nombre: "Paris Hilton",
    imagen: "uploads/prod_paris_hilton.jpg",
    stockMl: 500,
    precios: null
  },
  {
    id: "prod_amber_oud",
    nombre: "Al Haramain Amber Oud (Bleu Edition)",
    imagen: "uploads/prod_al_haramain_amber_oud.jpg",
    stockMl: 500,
    precios: null
  }
];

const DEFAULT_CONFIG = {
  bcv: "794.99",
  binance: "938.61",
  binanceSpread: "30", // Puntos personalizables sobre la tasa Binance
  cop: "3169.59",
  whatsapp: "",
  negocio: "Perfumería",
  banco: "",
  adminPassword: "admin",
  last_rates_update: "0",
  precios: { plastico35: "9500", vidrio30: "12000", vidrio50: "17500", vidrio60: "17500", refill: "8000" }, // Precios base en Bolívares (Bs.)
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const fmt = (n, d = 2) =>
  new Intl.NumberFormat("es-VE", { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number.isFinite(n) ? n : 0);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function normalizeStr(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function highlightMatch(text, query) {
  if (!query) return esc(text);
  const normText = normalizeStr(text);
  const normQuery = normalizeStr(query);
  const idx = normText.indexOf(normQuery);
  if (idx === -1) return esc(text);

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return `${esc(before)}<mark>${esc(match)}</mark>${esc(after)}`;
}

function formatRateTimestamp(ts) {
  if (!ts || ts === "0" || ts === 0) return "Nunca sincronizado";
  const num = typeof ts === "number" && ts < 10000000000 ? ts * 1000 : Number(ts);
  const d = new Date(num);
  if (isNaN(d.getTime())) return "Recientemente";

  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", hour12: true });

  if (isToday) {
    return `Hoy, ${timeStr}`;
  }
  return `${d.toLocaleDateString("es-VE", { day: "2-digit", month: "short" })}, ${timeStr}`;
}

// ---------------- state ----------------
let state = {
  route: "catalogo", // 'catalogo' | 'login' | 'admin'
  adminSub: "tasas", // 'tasas' | 'precios' | 'inventario' | 'datos'
  config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
  inventory: JSON.parse(JSON.stringify(INITIAL_INVENTORY)),

  searchCatalog: "",
  searchInventory: "",
  catalogSuggestions: [],
  inventorySuggestions: [],
  showCatalogSuggestions: false,
  showInventorySuggestions: false,

  cart: {}, // lineKey -> {productId, mode, sizeKey, qty}
  selection: {}, // productId -> {mode, presKey, refillKey}
  cartOpen: false,
  toast: null,
  toastTimer: null,
  newProd: {
    nombre: "",
    stockMl: "",
    imagen: "",
    customPricesEnabled: false,
    precios: { plastico35: "", vidrio30: "", vidrio5060: "", refill: "" }
  },
  editingProd: null,
  loginInput: "",
  loginError: "",
  isAuthenticated: false,
  isCloudMode: false,
  syncingRates: false,
};

let catalogDebounceTimer = null;
let inventoryDebounceTimer = null;

// ---------------- routing & auth helpers ----------------
function parseRoute() {
  const hash = (window.location.hash || "").toLowerCase();
  if (hash.startsWith("#/login") || hash.startsWith("#login")) return "login";
  if (hash.startsWith("#/admin") || hash.startsWith("#admin")) return "admin";
  return "catalogo";
}

function syncRouteFromHash() {
  const target = parseRoute();
  if (target === "admin" && !state.isAuthenticated) {
    navigateTo("login", true);
    return;
  }
  state.route = target;
  state.loginError = "";
  render();
}

function navigateTo(route, updateHash = true) {
  if (route === "admin" && !state.isAuthenticated) {
    route = "login";
  }
  state.route = route;
  state.loginError = "";
  if (updateHash) {
    if (route === "catalogo") {
      window.location.hash = "#/catalogo";
    } else if (route === "login") {
      window.location.hash = "#/login";
    } else if (route === "admin") {
      window.location.hash = "#/admin";
    }
  }
  render();
}

function handleLogin() {
  const entered = (state.loginInput || "").trim();
  if (!entered) {
    state.loginError = "Por favor, ingresa tu contraseña.";
    render();
    return;
  }

  const currentPass = (state.config.adminPassword || "admin").trim();
  if (entered === currentPass) {
    state.isAuthenticated = true;
    try { sessionStorage.setItem("perfumeria_admin_auth", "true"); } catch (e) { }
    state.loginInput = "";
    state.loginError = "";
    showToast("Acceso concedido al Panel Admin");
    navigateTo("admin");
  } else {
    state.loginError = "Contraseña incorrecta. Intenta nuevamente.";
    render();
  }
}

function handleLogout() {
  state.isAuthenticated = false;
  try {
    sessionStorage.removeItem("perfumeria_admin_auth");
  } catch (e) { }
  state.loginInput = "";
  state.loginError = "";
  showToast("Sesión cerrada.");
  navigateTo("catalogo");
}

// ---------------- sync live rates ----------------
async function fetchRealRates() {
  let newBcv = null;
  let newBinance = null;
  let newCop = null;

  // 1. Consultar Tasa Oficial BCV desde API pública en vivo
  try {
    const resBcv = await fetch("https://ve.dolarapi.com/v1/dolares/oficial", { cache: "no-store" });
    if (resBcv.ok) {
      const dataBcv = await resBcv.json();
      if (dataBcv && dataBcv.promedio) {
        newBcv = String(Number(dataBcv.promedio).toFixed(2));
      }
    }
  } catch (e) {
    console.warn("No se pudo obtener BCV desde DolarApi:", e);
  }

  // 2. Consultar Tasa Binance USDT en Bs. desde API / P2P
  try {
    const resBinance = await fetch("https://ve.dolarapi.com/v1/dolares/paralelo", { cache: "no-store" });
    if (resBinance.ok) {
      const dataBinance = await resBinance.json();
      if (dataBinance && dataBinance.promedio) {
        newBinance = String(Number(dataBinance.promedio).toFixed(2));
      }
    }
  } catch (e) {
    console.warn("No se pudo obtener tasa Binance/Paralelo:", e);
  }

  // 3. Consultar Tasa COP (USD a COP)
  try {
    const resCop = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
    if (resCop.ok) {
      const dataCop = await resCop.json();
      if (dataCop && dataCop.rates && dataCop.rates.COP) {
        newCop = String(Number(dataCop.rates.COP).toFixed(2));
      }
    }
  } catch (e) {
    console.warn("No se pudo obtener COP desde open.er-api:", e);
  }

  return { newBcv, newBinance, newCop };
}

async function syncLiveRates(silent = false) {
  state.syncingRates = true;
  if (!silent) render();

  try {
    const { newBcv, newBinance, newCop } = await fetchRealRates();
    let updated = false;

    if (newBcv && Number(newBcv) > 0) {
      state.config.bcv = newBcv;
      updated = true;
    }
    if (newBinance && Number(newBinance) > 0) {
      state.config.binance = newBinance;
      updated = true;
    }
    if (newCop && Number(newCop) > 0) {
      state.config.cop = newCop;
      updated = true;
    }

    state.config.last_rates_update = String(Math.floor(Date.now() / 1000));
    saveConfig();
    if (!silent) {
      showToast(updated ? "Tasas actualizadas con éxito" : "Tasas sincronizadas");
    }
  } catch (e) {
    if (!silent) showToast("Error al consultar tasas en vivo");
  }

  state.syncingRates = false;
  render();
}

function checkPeriodicRateSync() {
  const last = Number(state.config.last_rates_update) || 0;
  const now = Math.floor(Date.now() / 1000);
  const oneHour = 3600; // 1 hora en segundos

  // Si han pasado más de 60 minutos desde la última actualización, consultar automáticamente
  if (now - last > oneHour) {
    syncLiveRates(true);
  }
}

// ---------------- persistence & Firebase Cloud Sync ----------------
function initFirebaseListeners() {
  if (!db) {
    state.isCloudMode = false;
    return;
  }

  state.isCloudMode = true;

  // 1. Escuchar cambios de Configuración en tiempo real
  db.collection("settings").doc("main").onSnapshot((doc) => {
    if (doc.exists) {
      const data = doc.data();
      state.config = {
        ...DEFAULT_CONFIG,
        ...data,
        precios: { ...DEFAULT_CONFIG.precios, ...(data.precios || {}) }
      };
    } else {
      db.collection("settings").doc("main").set(DEFAULT_CONFIG, { merge: true });
    }
    render();
  }, (err) => {
    console.warn("Error leyendo settings de Firestore:", err);
  });

  // 2. Escuchar cambios de Inventario en tiempo real
  db.collection("products").orderBy("createdAt", "asc").onSnapshot((snapshot) => {
    if (!snapshot.empty) {
      const prods = [];
      snapshot.forEach((doc) => {
        const d = doc.data();
        prods.push({
          id: doc.id,
          nombre: d.nombre || "",
          imagen: d.imagen || "",
          stockMl: Number(d.stockMl) || 0,
          precios: d.precios || null
        });
      });
      state.inventory = prods;
      saveLocalBackup();
      render();
    } else {
      INITIAL_INVENTORY.forEach((p, idx) => {
        db.collection("products").doc(p.id).set({
          nombre: p.nombre,
          imagen: p.imagen,
          stockMl: p.stockMl,
          precios: p.precios,
          createdAt: Date.now() + idx
        });
      });
    }
  }, (err) => {
    console.warn("Error leyendo products de Firestore:", err);
  });
}

function loadState() {
  try {
    const c = localStorage.getItem("perfumeria_config");
    if (c) {
      const parsed = JSON.parse(c);
      state.config = { ...DEFAULT_CONFIG, ...parsed, precios: { ...DEFAULT_CONFIG.precios, ...(parsed.precios || {}) } };
    }
  } catch (e) { }

  try {
    const inv = localStorage.getItem("perfumeria_inventory");
    if (inv) {
      const parsedInv = JSON.parse(inv);
      if (Array.isArray(parsedInv) && parsedInv.length > 0) {
        state.inventory = parsedInv;
      }
    }
  } catch (e) { }

  try {
    const auth = sessionStorage.getItem("perfumeria_admin_auth");
    if (auth === "true") {
      state.isAuthenticated = true;
    }
  } catch (e) { }

  initFirebaseListeners();
  syncRouteFromHash();
  render();

  // Verificar si hace falta actualizar tasas automáticamente (cada 1 hora)
  checkPeriodicRateSync();
  setInterval(checkPeriodicRateSync, 60 * 1000);
}

function saveLocalBackup() {
  try {
    localStorage.setItem("perfumeria_config", JSON.stringify(state.config));
    localStorage.setItem("perfumeria_inventory", JSON.stringify(state.inventory));
  } catch (e) { }
}

let saveConfigTimer = null;
function saveConfig() {
  saveLocalBackup();

  if (db && state.isAuthenticated) {
    if (saveConfigTimer) clearTimeout(saveConfigTimer);
    saveConfigTimer = setTimeout(() => {
      db.collection("settings").doc("main").set(state.config, { merge: true }).catch((err) => {
        console.error("Error guardando config en Firestore:", err);
      });
    }, 400);
  }
}

// ---------------- toast ----------------
function showToast(msg) {
  state.toast = msg;
  if (state.toastTimer) clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { state.toast = null; render(); }, 2800);
  render();
}

// ---------------- computed helpers ----------------
function binanceSpread() {
  const s = parseFloat(state.config.binanceSpread);
  return Number.isFinite(s) ? s : 30;
}

function tasaVenta() {
  const binance = Number(state.config.binance) || 0;
  const spread = binanceSpread();
  return binance > 0 ? binance + spread : 0;
}

function tasaBCV() {
  const bcv = Number(state.config.bcv) || 0;
  return bcv > 0 ? bcv : 794.99;
}

function copPreview() {
  const cop = Number(state.config.cop) || 0;
  if (cop <= 0) return null;
  const usd = 1000 / cop;
  const tv = tasaVenta();
  const ves = tv > 0 ? usd * tv : null;
  return { usd, ves };
}

function sizeInfo(mode, sizeKey) {
  return mode === "refill" ? REFILL_SIZES.find((r) => r.key === sizeKey) : PRESENTATIONS.find((p) => p.key === sizeKey);
}

function sizeLabel(mode, sizeKey) {
  const info = sizeInfo(mode, sizeKey);
  if (!info) return "";
  return mode === "refill" ? `Recarga ${info.label}` : info.label;
}

// Precios base
function unitPriceVES(product, mode, sizeKey) {
  const key = mode === "refill" ? "refill" : sizeKey;
  if (product && product.precios) {
    if (Number(product.precios[key]) > 0) return Number(product.precios[key]);
    if ((key === "vidrio50" || key === "vidrio60") && Number(product.precios.vidrio5060) > 0) {
      return Number(product.precios.vidrio5060);
    }
  }
  if (mode === "refill") return Number(state.config.precios.refill) || 0;
  if (Number(state.config.precios[sizeKey]) > 0) return Number(state.config.precios[sizeKey]);
  if ((sizeKey === "vidrio50" || sizeKey === "vidrio60") && Number(state.config.precios.vidrio5060) > 0) {
    return Number(state.config.precios.vidrio5060);
  }
  return 0;
}

// Conversión a Dólares con la tasa oficial BCV
function unitPriceUSD(product, mode, sizeKey) {
  const ves = unitPriceVES(product, mode, sizeKey);
  const bcv = tasaBCV();
  return bcv > 0 ? ves / bcv : 0;
}

function hasCustomPrices(product) {
  if (!product || !product.precios) return false;
  return Object.values(product.precios).some((v) => Number(v) > 0);
}

function getSelection(productId) {
  return state.selection[productId] || { mode: "envase", presKey: PRESENTATIONS[0].key, refillKey: REFILL_SIZES[0].key };
}

function mlReservedForProduct(productId) {
  return Object.values(state.cart)
    .filter((l) => l.productId === productId)
    .reduce((sum, l) => sum + (sizeInfo(l.mode, l.sizeKey)?.ml || 0) * l.qty, 0);
}

function cartLines() {
  return Object.entries(state.cart)
    .map(([key, l]) => {
      const product = state.inventory.find((p) => p.id === l.productId);
      const info = sizeInfo(l.mode, l.sizeKey);
      const unitVES = unitPriceVES(product, l.mode, l.sizeKey);
      const unitUSD = unitPriceUSD(product, l.mode, l.sizeKey);
      const subVES = unitVES * l.qty;
      const subUSD = unitUSD * l.qty;
      return { key, product, info, mode: l.mode, sizeKey: l.sizeKey, qty: l.qty, unitVES, unitUSD, subVES, subUSD };
    })
    .filter((l) => l.product);
}

function cartCount() {
  return cartLines().reduce((s, l) => s + l.qty, 0);
}

function discountApplied() {
  return cartCount() >= VOLUME_QTY;
}

function totals() {
  const lines = cartLines();
  const vesRaw = lines.reduce((s, l) => s + l.subVES, 0);
  const ves = discountApplied() ? vesRaw * (1 - VOLUME_DISCOUNT) : vesRaw;
  const bcv = tasaBCV();
  const usd = bcv > 0 ? ves / bcv : 0;
  const usdRaw = bcv > 0 ? vesRaw / bcv : 0;
  return { vesRaw, ves, usd, usdRaw };
}

function lineKey(productId, mode, sizeKey) { return `${productId}__${mode}__${sizeKey}`; }

// ---------------- actions ----------------
function updateConfigField(key, value) { state.config[key] = value; saveConfig(); }
function updatePrecioField(key, value) { state.config.precios[key] = value; saveConfig(); }

function handleImageFile(file) {
  if (!file) return;
  if (file.size > MAX_IMG_BYTES) { showToast("La imagen pesa demasiado. Usa una menor a 3.5MB."); return; }
  const reader = new FileReader();
  reader.onload = () => { state.newProd.imagen = reader.result; render(); };
  reader.readAsDataURL(file);
}

function handleEditImageFile(file) {
  if (!file || !state.editingProd) return;
  if (file.size > MAX_IMG_BYTES) { showToast("La imagen pesa demasiado. Usa una menor a 3.5MB."); return; }
  const reader = new FileReader();
  reader.onload = () => {
    state.editingProd.imagen = reader.result;
    state.editingProd.newBase64 = reader.result;
    render();
  };
  reader.readAsDataURL(file);
}

async function addProduct() {
  if (!state.newProd.nombre.trim() || !state.newProd.stockMl) { showToast("Completa nombre y ml disponibles"); return; }

  const newId = uid();
  const nombre = state.newProd.nombre.trim();
  const stockMl = Number(state.newProd.stockMl);
  const imagen = state.newProd.imagen || "";
  const precios = state.newProd.customPricesEnabled ? { ...state.newProd.precios } : null;

  const newProductObj = { id: newId, nombre, imagen, stockMl, precios, createdAt: Date.now() };

  if (db && state.isAuthenticated) {
    try {
      await db.collection("products").doc(newId).set(newProductObj);
      showToast(`"${nombre}" guardado en Firebase`);
    } catch (e) {
      showToast("Error guardando: " + e.message);
    }
  } else {
    state.inventory.push(newProductObj);
    saveLocalBackup();
    showToast(`${nombre} agregado al catálogo`);
  }

  state.newProd = {
    nombre: "",
    stockMl: "",
    imagen: "",
    customPricesEnabled: false,
    precios: { plastico35: "", vidrio30: "", vidrio5060: "", refill: "" }
  };
  render();
}

function startEditProduct(id) {
  const p = state.inventory.find((x) => x.id === id);
  if (!p) return;
  const cp = p.precios || {};
  const hasCp = hasCustomPrices(p);
  state.editingProd = {
    id: p.id,
    nombre: p.nombre,
    stockMl: String(p.stockMl),
    imagen: p.imagen || "",
    newBase64: "",
    customPricesEnabled: hasCp,
    precios: {
      plastico35: cp.plastico35 != null ? String(cp.plastico35) : "",
      vidrio30: cp.vidrio30 != null ? String(cp.vidrio30) : "",
      vidrio50: cp.vidrio50 != null ? String(cp.vidrio50) : (cp.vidrio5060 != null ? String(cp.vidrio5060) : ""),
      vidrio60: cp.vidrio60 != null ? String(cp.vidrio60) : (cp.vidrio5060 != null ? String(cp.vidrio5060) : ""),
      refill: cp.refill != null ? String(cp.refill) : ""
    }
  };
  render();
}

function cancelEditProduct() {
  state.editingProd = null;
  render();
}

async function saveEditProduct() {
  if (!state.editingProd) return;
  const { id, nombre, stockMl, imagen, newBase64, customPricesEnabled, precios } = state.editingProd;
  const cleanName = (nombre || "").trim();
  const cleanStock = parseInt(stockMl, 10);

  if (!cleanName || isNaN(cleanStock) || cleanStock < 0) {
    showToast("Por favor ingresa un nombre y stock válidos");
    return;
  }

  const imageToSend = newBase64 || imagen;
  let cleanPrices = null;
  if (customPricesEnabled && precios) {
    cleanPrices = {};
    ["plastico35", "vidrio30", "vidrio50", "vidrio60", "refill"].forEach((k) => {
      if (precios[k] && Number(precios[k]) > 0) cleanPrices[k] = precios[k];
    });
    if (Object.keys(cleanPrices).length === 0) cleanPrices = null;
  }

  const updatedData = {
    nombre: cleanName,
    stockMl: cleanStock,
    imagen: imageToSend,
    precios: cleanPrices
  };

  if (db && state.isAuthenticated) {
    try {
      await db.collection("products").doc(id).update(updatedData);
      showToast("Esencia actualizada en la nube");
    } catch (e) {
      showToast("Error al actualizar: " + e.message);
    }
  } else {
    const p = state.inventory.find((x) => x.id === id);
    if (p) {
      p.nombre = cleanName;
      p.stockMl = cleanStock;
      p.imagen = imageToSend;
      p.precios = cleanPrices;
    }
    saveLocalBackup();
    showToast("Esencia actualizada");
  }

  state.editingProd = null;
  render();
}

async function adjustStock(id, delta) {
  const p = state.inventory.find((x) => x.id === id);
  if (!p) return;
  const nextStock = Math.max(0, p.stockMl + delta);

  if (db && state.isAuthenticated) {
    try {
      await db.collection("products").doc(id).update({ stockMl: nextStock });
      showToast(`${delta > 0 ? "+" : ""}${delta} ml aplicados a ${p.nombre}`);
    } catch (e) {
      showToast("Error al ajustar stock en la nube");
    }
  } else {
    p.stockMl = nextStock;
    saveLocalBackup();
    showToast(`${delta > 0 ? "+" : ""}${delta} ml aplicados a ${p.nombre}`);
    render();
  }
}

function promptAddCustomStock(id) {
  const p = state.inventory.find((x) => x.id === id);
  if (!p) return;
  const input = prompt(`Ingresa la cantidad exacta de mililitros (ml) a SUMAR a "${p.nombre}":\n(Stock actual: ${p.stockMl} ml)`, "100");
  if (input == null) return;
  const delta = parseInt(input, 10);
  if (isNaN(delta) || delta === 0) {
    showToast("Cantidad inválida");
    return;
  }
  adjustStock(id, delta);
}

function addStockToEditForm(delta) {
  if (!state.editingProd) return;
  const current = parseInt(state.editingProd.stockMl, 10) || 0;
  state.editingProd.stockMl = String(Math.max(0, current + delta));
  showToast(`+${delta} ml sumados (Nuevo total: ${state.editingProd.stockMl} ml)`);
  render();
}

async function removeProduct(id) {
  const p = state.inventory.find((x) => x.id === id);
  const name = p ? p.nombre : "la esencia";
  if (!confirm(`¿Estás seguro de eliminar "${name}" del catálogo?`)) return;

  if (db && state.isAuthenticated) {
    try {
      await db.collection("products").doc(id).delete();
      showToast(`"${name}" eliminada de la nube.`);
    } catch (e) {
      showToast("Error eliminando de la nube: " + e.message);
    }
  } else {
    state.inventory = state.inventory.filter((item) => item.id !== id);
    saveLocalBackup();
    showToast(`"${name}" eliminada.`);
  }

  Object.keys(state.cart).forEach((k) => { if (state.cart[k].productId === id) delete state.cart[k]; });
  render();
}

function setSelPres(productId, presKey) {
  state.selection[productId] = { ...getSelection(productId), presKey, mode: "envase" };
  render();
}

function setSelRefillSize(productId, refillKey) {
  state.selection[productId] = { ...getSelection(productId), refillKey, mode: "refill" };
  render();
}

function addToCart(productId) {
  const product = state.inventory.find((p) => p.id === productId);
  if (!product) return;
  const sel = getSelection(productId);
  const sizeKey = sel.mode === "refill" ? sel.refillKey : sel.presKey;
  const info = sizeInfo(sel.mode, sizeKey);
  const already = mlReservedForProduct(productId);
  if (already + info.ml > product.stockMl) { showToast("No hay suficiente stock en ml para esa presentación"); return; }
  const key = lineKey(productId, sel.mode, sizeKey);
  const current = state.cart[key];
  state.cart[key] = { productId, mode: sel.mode, sizeKey, qty: (current?.qty || 0) + 1 };
  render();
}

function changeCartQty(key, delta) {
  const line = state.cart[key];
  if (!line) return;
  const product = state.inventory.find((p) => p.id === line.productId);
  const info = sizeInfo(line.mode, line.sizeKey);
  if (delta > 0 && product) {
    const already = mlReservedForProduct(line.productId);
    if (already + info.ml > product.stockMl) { showToast("No hay suficiente stock en ml para esa presentación"); return; }
  }
  const nextQty = Math.max(0, line.qty + delta);
  if (nextQty === 0) delete state.cart[key];
  else state.cart[key] = { ...line, qty: nextQty };
  render();
}

function buildWhatsAppMessage() {
  const lines = cartLines();
  const t = totals();
  let msg = `*Nuevo pedido — ${state.config.negocio || "Perfumería"}*\n\n`;
  lines.forEach((l) => {
    msg += `• ${l.product.nombre} — ${sizeLabel(l.mode, l.sizeKey)} x${l.qty} — Bs. ${fmt(l.subVES)} (≈ $${fmt(l.subUSD)} BCV)\n`;
  });
  if (discountApplied()) msg += `\n_Descuento por volumen (3+ unidades): -20%_`;
  msg += `\n\n*Total a pagar:* Bs. ${fmt(t.ves)}`;
  msg += `\n*Referencia en USD (Tasa BCV):* $${fmt(t.usd)}`;
  if (state.config.banco) msg += `\n\n*Datos para el pago:*\n${state.config.banco}`;
  return msg;
}

function buildWhatsAppUrl() {
  const digits = (state.config.whatsapp || "").replace(/\D/g, "");
  if (!digits || cartLines().length === 0) return "#";
  return `https://wa.me/${digits}?text=${encodeURIComponent(buildWhatsAppMessage())}`;
}

async function handleSendClick(e) {
  if (!state.config.whatsapp) {
    e.preventDefault();
    showToast("Configura tu número de WhatsApp en Panel Admin > Datos");
    return;
  }
  const lines = cartLines();
  if (lines.length === 0) { e.preventDefault(); return; }

  lines.forEach((l) => {
    const p = state.inventory.find((x) => x.id === l.product.id);
    const consumedMl = l.info.ml * l.qty;
    if (p) {
      const nextStock = Math.max(0, p.stockMl - consumedMl);
      if (db) {
        db.collection("products").doc(p.id).update({ stockMl: nextStock });
      }
    }
  });

  state.cart = {};
  state.cartOpen = false;
  showToast("Pedido generado, abriendo WhatsApp...");
}

// ---------------- Autocompletado y Búsqueda con 1s de Espera (Debounce) ----------------
function handleCatalogSearchInput(val) {
  state.searchCatalog = val;
  const q = normalizeStr(val);

  if (catalogDebounceTimer) clearTimeout(catalogDebounceTimer);

  if (!q) {
    state.catalogSuggestions = [];
    state.showCatalogSuggestions = false;
    render();
    return;
  }

  catalogDebounceTimer = setTimeout(() => {
    const available = state.inventory.filter((p) => p.stockMl > 0);
    const matches = available.filter((p) => normalizeStr(p.nombre).includes(q));

    state.catalogSuggestions = matches.slice(0, 5);
    state.showCatalogSuggestions = state.catalogSuggestions.length > 0;
    render();
  }, 1000);
}

function handleInventorySearchInput(val) {
  state.searchInventory = val;
  const q = normalizeStr(val);

  if (inventoryDebounceTimer) clearTimeout(inventoryDebounceTimer);

  if (!q) {
    state.inventorySuggestions = [];
    state.showInventorySuggestions = false;
    render();
    return;
  }

  inventoryDebounceTimer = setTimeout(() => {
    const matches = state.inventory.filter((p) => normalizeStr(p.nombre).includes(q));
    state.inventorySuggestions = matches.slice(0, 5);
    state.showInventorySuggestions = state.inventorySuggestions.length > 0;
    render();
  }, 1000);
}

function selectCatalogSuggestion(productName) {
  state.searchCatalog = productName;
  state.showCatalogSuggestions = false;
  state.catalogSuggestions = [];
  render();
}

function selectInventorySuggestion(productName) {
  state.searchInventory = productName;
  state.showInventorySuggestions = false;
  state.inventorySuggestions = [];
  render();
}

// ---------------- templates ----------------
function tpl_header() {
  if (state.route === "catalogo") {
    return `
    <div class="perf-header">
      <div class="perf-brand"><i data-lucide="sparkles" size="14"></i> ${esc(state.config.negocio || "Perfumería")}</div>
      <div class="perf-title">Catálogo &amp; Pedidos</div>
      <div class="perf-sub">Fragancias exclusivas, envases y recargas disponibles</div>
    </div>`;
  }
  if (state.route === "admin") {
    return `
    <div class="perf-header perf-admin-header">
      <div class="perf-header-top">
        <div>
          <div class="perf-brand"><i data-lucide="shield-check" size="14"></i> Modo Administrador ${state.isCloudMode ? '<span style="font-size:10.5px;opacity:0.9;color:var(--ok)">● Firebase Nube</span>' : ''}</div>
          <div class="perf-title" style="font-size:22px">Panel de Control</div>
        </div>
        <div class="perf-admin-nav-actions">
          <button class="perf-btn ghost sm" data-action="nav-catalogo" title="Ir al catálogo público">
            <i data-lucide="store" size="14"></i> Catálogo
          </button>
          <button class="perf-btn danger sm" data-action="do-logout" title="Cerrar sesión de administración">
            <i data-lucide="log-out" size="14"></i> Salir
          </button>
        </div>
      </div>
    </div>`;
  }
  return `
  <div class="perf-header">
    <div class="perf-brand"><i data-lucide="sparkles" size="14"></i> ${esc(state.config.negocio || "Perfumería")}</div>
    <div class="perf-title">Acceso Administrativo</div>
    <div class="perf-sub">Ingreso seguro para gestión de catálogo y tasas</div>
  </div>`;
}

function tpl_login() {
  return `
  <div class="perf-section">
    <div class="perf-card perf-login-card">
      <div class="perf-login-icon"><i data-lucide="lock" size="32"></i></div>
      <div class="perf-login-title">Iniciar Sesión</div>
      <div class="perf-login-sub">Introduce tu clave de administrador para gestionar tasas, precios e inventario en la nube.</div>

      ${state.loginError ? `<div class="perf-login-err"><i data-lucide="alert-circle" size="15"></i> ${esc(state.loginError)}</div>` : ""}

      <div class="perf-field" style="text-align:left">
        <label class="perf-label"><span>Contraseña / PIN</span></label>
        <input id="login-pass" class="perf-input" type="password" placeholder="Ingresa tu clave (por defecto: admin)" value="${esc(state.loginInput)}" data-action="input-login" autocomplete="current-password" />
      </div>

      <button class="perf-btn gold full" style="margin-top:14px" data-action="do-login">
        <i data-lucide="key-round" size="16"></i> Entrar al Panel
      </button>

      <div style="text-align:center;margin-top:18px">
        <button class="perf-linkbtn" data-action="nav-catalogo">
          <i data-lucide="arrow-left" size="14"></i> Volver al Catálogo Público
        </button>
      </div>
    </div>
  </div>`;
}

function tpl_admin() {
  const subtabs = [
    ["tasas", "Tasas"],
    ["precios", "Precios (Bs.)"],
    ["inventario", "Inventario"],
    ["datos", "Datos & Banco"],
  ];
  return `
  <div class="perf-subtabs">
    ${subtabs.map(([k, label]) => `<button class="perf-subtab ${state.adminSub === k ? "active" : ""}" data-action="set-adminsub" data-sub="${k}">${label}</button>`).join("")}
  </div>
  ${state.adminSub === "tasas" ? tpl_admin_tasas() : ""}
  ${state.adminSub === "precios" ? tpl_admin_precios() : ""}
  ${state.adminSub === "inventario" ? tpl_admin_inventario() : ""}
  ${state.adminSub === "datos" ? tpl_admin_datos() : ""}
  `;
}

function tpl_admin_tasas() {
  const tv = tasaVenta();
  const cp = copPreview();
  const spread = binanceSpread();

  return `
  <div class="perf-section">
    <div class="perf-rates-syncbar">
      <div>
        <div class="perf-syncbar-title"><i data-lucide="refresh-cw" class="${state.syncingRates ? "perf-spin" : ""}" size="14"></i> Consulta Automática de Tasas</div>
        <div class="perf-syncbar-time">Sincronizado: ${formatRateTimestamp(state.config.last_rates_update)}</div>
      </div>
      <button class="perf-btn gold sm" data-action="sync-rates" ${state.syncingRates ? "disabled" : ""} title="Consultar BCV, Binance y Google COP en vivo">
        <i data-lucide="refresh-cw" class="${state.syncingRates ? "perf-spin" : ""}" size="13"></i>
        ${state.syncingRates ? "Consultando..." : "Actualizar en vivo"}
      </button>
    </div>

    <div class="perf-card">
      <div class="perf-card-title"><i data-lucide="droplet" class="perf-drop" size="16"></i> Tasas de Cambio &amp; Margen</div>
      
      <div class="perf-field">
        <label class="perf-label">
          <span>Tasa BCV Oficial (USD en Bs.)</span>
          <span class="perf-badge-live">bcv.org.ve</span>
        </label>
        <input id="cfg-bcv" class="perf-input" inputmode="decimal" placeholder="Ej: 794.99" value="${esc(state.config.bcv)}" data-action="input-config" data-field="bcv" />
        <div class="perf-card-hint" style="margin:6px 0 0">Tasa oficial utilizada para mostrar la referencia en dólares ($) en el catálogo y pop-up BCV.</div>
      </div>

      <div class="perf-field">
        <label class="perf-label">
          <span>Tasa Binance (USDT en Bs.)</span>
          <span class="perf-badge-live">P2P Binance</span>
        </label>
        <input id="cfg-binance" class="perf-input" inputmode="decimal" placeholder="Ej: 938.61" value="${esc(state.config.binance)}" data-action="input-config" data-field="binance" />
      </div>

      <div class="perf-field">
        <label class="perf-label">
          <span>Puntos a sumar sobre Binance (Bs.)</span>
          <span class="perf-badge-live" style="color:var(--gold-soft);background:rgba(229,184,105,0.15);border-color:rgba(229,184,105,0.4)">Personalizable</span>
        </label>
        <input id="cfg-spread" class="perf-input" inputmode="decimal" placeholder="Ej: 30" value="${esc(state.config.binanceSpread != null ? state.config.binanceSpread : "30")}" data-action="input-config" data-field="binanceSpread" />
        <div class="perf-card-hint" style="margin:6px 0 0">Puntos exactos en Bolívares que se le suman a la tasa Binance (Ej: 30, 40, 50...).</div>
      </div>

      <div class="perf-computed">
        <span class="perf-computed-label">Tasa de venta calculada (Binance + ${spread} Bs.)</span>
        <span class="perf-computed-value">${fmt(tv)} Bs.</span>
      </div>
    </div>

    <div class="perf-card">
      <div class="perf-card-title"><i data-lucide="landmark" size="16"></i> Tasa COP (Pesos Colombianos)</div>
      <div class="perf-field">
        <label class="perf-label">
          <span>Tasa COP (USD a Pesos - Google)</span>
          <span class="perf-badge-live">Google Finance</span>
        </label>
        <input id="cfg-cop" class="perf-input" inputmode="decimal" placeholder="Ej: 3169.59" value="${esc(state.config.cop)}" data-action="input-config" data-field="cop" />
      </div>
      ${cp ? `<div class="perf-card-hint" style="margin:0">1.000 COP ≈ $${fmt(cp.usd, 4)} USD${cp.ves != null ? ` ≈ Bs. ${fmt(cp.ves)}` : ""}</div>` : ""}
    </div>
  </div>`;
}

function tpl_admin_precios() {
  const bcv = tasaBCV();
  return `
  <div class="perf-section">
    <div class="perf-card">
      <div class="perf-card-title"><i data-lucide="tag" size="16"></i> Configuración de Precios por Presentación</div>
      <div class="perf-card-hint">Edita los precios base en Bolívares (Bs.). El valor de referencia en dólares ($) se calcula automáticamente según la tasa oficial BCV (${fmt(bcv)} Bs.).</div>
      
      <div class="perf-table-wrapper">
        <table class="perf-table">
          <thead>
            <tr>
              <th>Presentación / Tipo</th>
              <th>Mililitros</th>
              <th style="min-width:140px">Precio Base (Bs.)</th>
              <th>Referencia USD</th>
            </tr>
          </thead>
          <tbody>
            ${PRESENTATIONS.map((p) => {
              const vesVal = Number(state.config.precios[p.key]) || 0;
              const usdVal = bcv > 0 ? vesVal / bcv : 0;
              return `
              <tr>
                <td>
                  <strong style="color:#ffffff">${p.label}</strong>
                </td>
                <td><span style="font-family:'IBM Plex Mono',monospace;color:rgba(248,250,252,0.75)">${p.ml} ml</span></td>
                <td>
                  <input id="precio-${p.key}" class="perf-table-input" inputmode="decimal" placeholder="Bs." value="${esc(state.config.precios[p.key])}" data-action="input-precio" data-field="${p.key}" />
                </td>
                <td>
                  <span style="font-family:'IBM Plex Mono',monospace;color:var(--gold-soft);font-size:12.5px">≈ $${fmt(usdVal)}</span>
                  <span class="perf-bcv-badge">BCV</span>
                </td>
              </tr>`;
            }).join("")}
            <tr>
              <td>
                <strong style="color:#ffffff">Recargas / Refills (30ml y 35ml)</strong>
              </td>
              <td><span style="font-family:'IBM Plex Mono',monospace;color:rgba(248,250,252,0.75)">30 - 35 ml</span></td>
              <td>
                <input id="precio-refill" class="perf-table-input" inputmode="decimal" placeholder="Bs." value="${esc(state.config.precios.refill)}" data-action="input-precio" data-field="refill" />
              </td>
              <td>
                <span style="font-family:'IBM Plex Mono',monospace;color:var(--gold-soft);font-size:12.5px">≈ $${fmt(Number(state.config.precios.refill) / bcv)}</span>
                <span class="perf-bcv-badge">BCV</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="perf-card-hint" style="margin-top:12px;font-size:11.5px;color:rgba(248,250,252,0.5)">* Los cambios se guardan y sincronizan automáticamente en tiempo real con Firebase en la nube.</div>
    </div>
  </div>`;
}

function tpl_admin_inventario() {
  const ep = state.editingProd;
  const bcv = tasaBCV();
  const q = normalizeStr(state.searchInventory);
  const filtered = state.inventory.filter((p) => normalizeStr(p.nombre).includes(q));

  return `
  <div class="perf-section">
    ${ep ? `
      <!-- Formulario de Edición de Esencia -->
      <div class="perf-edit-card">
        <div class="perf-card-title" style="color:var(--gold-soft)">
          <i data-lucide="edit-3" size="17"></i> Editar Esencia (Nube)
        </div>
        
        <div class="perf-field">
          <label class="perf-label"><span>Nombre de la esencia</span></label>
          <input id="editprod-nombre" class="perf-input text" placeholder="Nombre" value="${esc(ep.nombre)}" data-action="input-editprod" data-field="nombre" />
        </div>

        <div class="perf-field">
          <label class="perf-label"><span>Stock total en mililitros (ml)</span></label>
          <input id="editprod-stockml" class="perf-input" inputmode="numeric" placeholder="Ej: 500" value="${esc(ep.stockMl)}" data-action="input-editprod" data-field="stockMl" />
          <div style="margin-top:6px">
            <span style="font-size:11.5px;color:rgba(248,250,252,0.55)">Sumar ml rápidamente:</span>
            <div class="perf-quick-add-group">
              <button type="button" class="perf-quick-add-btn" data-action="add-stock-edit" data-amount="10">+10 ml</button>
              <button type="button" class="perf-quick-add-btn" data-action="add-stock-edit" data-amount="50">+50 ml</button>
              <button type="button" class="perf-quick-add-btn" data-action="add-stock-edit" data-amount="100">+100 ml</button>
              <button type="button" class="perf-quick-add-btn" data-action="add-stock-edit" data-amount="250">+250 ml</button>
              <button type="button" class="perf-quick-add-btn" data-action="add-stock-edit" data-amount="500">+500 ml</button>
            </div>
          </div>
        </div>

        <div class="perf-field">
          <label class="perf-label"><span>Foto del perfume / esencia</span></label>
          <div class="perf-uploadbox" data-action="trigger-edit-upload">
            ${ep.imagen ? `<img src="${ep.imagen}" alt="" />` : `<div class="ph"><i data-lucide="image" size="20"></i></div>`}
            <span><i data-lucide="upload" size="14" style="vertical-align:middle;margin-right:5px"></i>Cambiar foto</span>
          </div>
          <input id="editprod-file" class="perf-hidden-file" type="file" accept="image/*" data-action="upload-edit-image" />
        </div>

        <!-- Sección de Precios Individuales en Bs. -->
        <div class="perf-custom-prices-box">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;font-size:13px;color:var(--gold-soft)">
            <input type="checkbox" ${ep.customPricesEnabled ? "checked" : ""} data-action="toggle-edit-custom-prices" style="accent-color:var(--gold);width:16px;height:16px" />
            <span>💰 Personalizar precios en Bs. para esta fragancia</span>
          </label>
          <div class="perf-card-hint" style="margin:4px 0 10px">Si está desactivado, usa los precios globales en Bs. configurados en la pestaña "Precios".</div>
          
          ${ep.customPricesEnabled ? `
            <div class="perf-row2" style="margin-top:8px">
              ${PRESENTATIONS.map((p) => {
    const vesVal = Number(ep.precios[p.key]) || 0;
    const usdVal = bcv > 0 ? vesVal / bcv : 0;
    return `
                <div class="perf-field" style="min-width:45%">
                  <label class="perf-label"><span>${p.label} (Bs.)</span></label>
                  <input class="perf-input" inputmode="decimal" placeholder="Global: ${state.config.precios[p.key] || '0'} Bs." value="${esc(ep.precios[p.key] || '')}" data-action="input-editprod-price" data-field="${p.key}" />
                  ${vesVal > 0 ? `<div class="perf-card-hint" style="margin:4px 0 0">≈ $${fmt(usdVal)} <span class="perf-bcv-badge">BCV</span></div>` : ""}
                </div>`;
  }).join("")}
              <div class="perf-field" style="min-width:45%">
                <label class="perf-label"><span>Recarga / Refill (Bs.)</span></label>
                <input class="perf-input" inputmode="decimal" placeholder="Global: ${state.config.precios.refill || '0'} Bs." value="${esc(ep.precios.refill || '')}" data-action="input-editprod-price" data-field="refill" />
                ${Number(ep.precios.refill) > 0 ? `<div class="perf-card-hint" style="margin:4px 0 0">≈ $${fmt(Number(ep.precios.refill) / bcv)} <span class="perf-bcv-badge">BCV</span></div>` : ""}
              </div>
            </div>
          ` : ""}
        </div>

        <div class="perf-row" style="margin-top:14px">
          <button class="perf-btn gold full" data-action="save-edit-product">
            <i data-lucide="check" size="16"></i> Guardar Cambios en Nube
          </button>
          <button class="perf-btn outline full" data-action="cancel-edit-product">
            <i data-lucide="x" size="16"></i> Cancelar
          </button>
        </div>
      </div>
    ` : `
      <!-- Formulario de Registro de Nueva Esencia -->
      <div class="perf-card">
        <div class="perf-card-title"><i data-lucide="plus" size="16"></i> Registrar nueva esencia en Firebase</div>
        <div class="perf-field">
          <label class="perf-label"><span>Nombre de la esencia</span></label>
          <input id="newprod-nombre" class="perf-input text" placeholder="Ej: Carolina Herrera Good Girl" value="${esc(state.newProd.nombre)}" data-action="input-newprod" data-field="nombre" />
        </div>
        <div class="perf-field">
          <label class="perf-label"><span>Mililitros de esencia iniciales (ml)</span></label>
          <input id="newprod-stockml" class="perf-input" inputmode="numeric" placeholder="Ej: 500" value="${esc(state.newProd.stockMl)}" data-action="input-newprod" data-field="stockMl" />
        </div>
        <div class="perf-field">
          <label class="perf-label"><span>Imagen de referencia</span></label>
          <div class="perf-uploadbox" data-action="trigger-upload">
            ${state.newProd.imagen ? `<img src="${state.newProd.imagen}" alt="" />` : `<div class="ph"><i data-lucide="image" size="20"></i></div>`}
            <span><i data-lucide="upload" size="14" style="vertical-align:middle;margin-right:5px"></i>Subir foto</span>
          </div>
          <input id="newprod-file" class="perf-hidden-file" type="file" accept="image/*" data-action="upload-image" />
        </div>
        <button class="perf-btn gold full" data-action="add-product"><i data-lucide="cloud-upload" size="16"></i> Guardar en la Nube</button>
      </div>
    `}

    <!-- Buscador en Inventario con Autocompletado (1s de espera) -->
    <div class="perf-search-container">
      <div class="perf-searchbox">
        <i data-lucide="search" class="perf-search-icon" size="16"></i>
        <input type="text" id="inventory-search-input" class="perf-search-input" placeholder="Buscar esencia en inventario..." value="${esc(state.searchInventory)}" data-action="input-search-inventory" autocomplete="off" />
        ${state.searchInventory ? `<button class="perf-search-clear" data-action="clear-search-inventory" title="Borrar búsqueda"><i data-lucide="x" size="14"></i></button>` : ""}
      </div>

      <!-- Dropdown de Sugerencias de Autocompletado -->
      ${state.showInventorySuggestions && state.inventorySuggestions.length > 0 ? `
        <div class="perf-suggestions-dropdown">
          ${state.inventorySuggestions.map((item) => `
            <div class="perf-suggestion-item" data-action="select-inventory-suggestion" data-name="${esc(item.nombre)}">
              <img class="perf-suggestion-thumb" src="${item.imagen || PLACEHOLDER_IMG}" alt="" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'" />
              <div class="perf-suggestion-info">
                <div class="perf-suggestion-name">${highlightMatch(item.nombre, state.searchInventory)}</div>
                <div class="perf-suggestion-meta">${item.stockMl} ml disponibles</div>
              </div>
              <i data-lucide="corner-down-left" class="perf-suggestion-arrow" size="14"></i>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </div>

    <div class="perf-card">
      <div class="perf-card-title">
        <i data-lucide="package" size="16"></i> Esencias en Catálogo (${state.inventory.length}${q ? ` · ${filtered.length} encontradas` : ""})
      </div>
      ${state.inventory.length === 0 ? `
        <div class="perf-empty"><i data-lucide="package-x" size="28"></i><div class="perf-empty-title">Sin esencias aún</div><div class="perf-empty-sub">Regístrala arriba para que aparezca en el catálogo</div></div>
      ` : filtered.length === 0 ? `
        <div class="perf-empty"><i data-lucide="search-x" size="28"></i><div class="perf-empty-title">Sin resultados</div><div class="perf-empty-sub">No se encontró ninguna esencia para "${esc(state.searchInventory)}"</div></div>
      ` : `
        <div class="perf-prodlist">
          ${filtered.map((p) => {
    const hasCp = hasCustomPrices(p);
    return `
            <div class="perf-prod">
              <div class="perf-prod-row">
                <img class="perf-prod-thumb" src="${p.imagen || PLACEHOLDER_IMG}" alt="" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'" />
                <div class="perf-prod-info">
                  <div class="perf-prod-name">
                    ${highlightMatch(p.nombre, state.searchInventory)}
                    ${hasCp ? `<span class="perf-badge-custom-price" title="Tiene precios individuales asignados">Precio personalizado</span>` : ""}
                  </div>
                  <div class="perf-prod-stock ${p.stockMl <= 40 ? "low" : "ok"}">${p.stockMl} ml en stock</div>
                </div>
                <div class="perf-prod-actions">
                  <button class="perf-iconbtn edit" data-action="edit-product" data-id="${p.id}" title="Editar nombre, stock, fotos y precios"><i data-lucide="edit-3" size="14"></i></button>
                  <button class="perf-iconbtn" data-action="adjust-stock" data-id="${p.id}" data-delta="-10" title="Restar 10ml"><i data-lucide="minus" size="14"></i></button>
                  <button class="perf-iconbtn" data-action="adjust-stock" data-id="${p.id}" data-delta="10" title="Sumar 10ml"><i data-lucide="plus" size="14"></i></button>
                  <button class="perf-iconbtn danger" data-action="remove-product" data-id="${p.id}" title="Eliminar esencia"><i data-lucide="trash-2" size="14"></i></button>
                </div>
              </div>
              <div class="perf-prod-quick-stock">
                <span>Sumar stock rápido:</span>
                <button type="button" class="perf-stock-pill" data-action="adjust-stock" data-id="${p.id}" data-delta="50">+50ml</button>
                <button type="button" class="perf-stock-pill" data-action="adjust-stock" data-id="${p.id}" data-delta="100">+100ml</button>
                <button type="button" class="perf-stock-pill" data-action="adjust-stock" data-id="${p.id}" data-delta="250">+250ml</button>
                <button type="button" class="perf-stock-pill" data-action="prompt-custom-stock" data-id="${p.id}">+ Cantidad...</button>
              </div>
            </div>`;
  }).join("")}
        </div>
      `}
    </div>
  </div>`;
}

function tpl_admin_datos() {
  return `
  <div class="perf-section">
    <div class="perf-card">
      <div class="perf-card-title"><i data-lucide="send" size="16"></i> Contacto</div>
      <div class="perf-field">
        <label class="perf-label"><span>Nombre del negocio</span></label>
        <input id="cfg-negocio" class="perf-input text" value="${esc(state.config.negocio)}" data-action="input-config" data-field="negocio" />
      </div>
      <div class="perf-field">
        <label class="perf-label"><span>WhatsApp (código de país + número, solo dígitos)</span></label>
        <input id="cfg-whatsapp" class="perf-input" inputmode="numeric" placeholder="Ej: 584145437791" value="${esc(state.config.whatsapp)}" data-action="input-config" data-field="whatsapp" />
        <div class="perf-card-hint" style="margin:6px 0 0">No incluyas "+" ni espacios.</div>
      </div>
    </div>
    <div class="perf-card">
      <div class="perf-card-title"><i data-lucide="landmark" size="16"></i> Datos bancarios / Pago móvil</div>
      <div class="perf-field">
        <textarea id="cfg-banco" class="perf-textarea" rows="4" placeholder="Banco, titular, cédula/RIF, número de cuenta o pago móvil..." data-action="input-config" data-field="banco">${esc(state.config.banco)}</textarea>
      </div>
      <div class="perf-card-hint">Se incluyen automáticamente al final del mensaje de WhatsApp del pedido.</div>
    </div>
    <div class="perf-card">
      <div class="perf-card-title"><i data-lucide="shield" size="16"></i> Seguridad de Administración</div>
      <div class="perf-field">
        <label class="perf-label"><span>Contraseña de acceso al Panel Admin</span></label>
        <input id="cfg-adminpass" class="perf-input" type="text" placeholder="Ej: admin123" value="${esc(state.config.adminPassword || "admin")}" data-action="input-config" data-field="adminPassword" />
        <div class="perf-card-hint" style="margin:6px 0 0">Contraseña solicitada al ingresar a la ruta /login.</div>
      </div>
    </div>
  </div>`;
}

function tpl_catalogo() {
  const catalog = state.inventory.filter((p) => p.stockMl > 0);
  const q = normalizeStr(state.searchCatalog);
  const filtered = catalog.filter((p) => normalizeStr(p.nombre).includes(q));

  return `
  <div class="perf-section">
    <!-- Buscador en Catálogo Cliente con Autocompletado (1s de espera) -->
    <div class="perf-search-container">
      <div class="perf-searchbox">
        <i data-lucide="search" class="perf-search-icon" size="16"></i>
        <input type="text" id="catalog-search-input" class="perf-search-input" placeholder="Buscar perfume o fragancia..." value="${esc(state.searchCatalog)}" data-action="input-search-catalog" autocomplete="off" />
        ${state.searchCatalog ? `<button class="perf-search-clear" data-action="clear-search-catalog" title="Borrar búsqueda"><i data-lucide="x" size="14"></i></button>` : ""}
      </div>

      <!-- Dropdown de Sugerencias de Autocompletado -->
      ${state.showCatalogSuggestions && state.catalogSuggestions.length > 0 ? `
        <div class="perf-suggestions-dropdown">
          ${state.catalogSuggestions.map((item) => {
    const ves = unitPriceVES(item, "envase", PRESENTATIONS[0].key);
    const usd = unitPriceUSD(item, "envase", PRESENTATIONS[0].key);
    return `
            <div class="perf-suggestion-item" data-action="select-catalog-suggestion" data-name="${esc(item.nombre)}">
              <img class="perf-suggestion-thumb" src="${item.imagen || PLACEHOLDER_IMG}" alt="" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'" />
              <div class="perf-suggestion-info">
                <div class="perf-suggestion-name">${highlightMatch(item.nombre, state.searchCatalog)}</div>
                <div class="perf-suggestion-meta">Bs. ${fmt(ves)} (≈ $${fmt(usd)} BCV)</div>
              </div>
              <i data-lucide="corner-down-left" class="perf-suggestion-arrow" size="14"></i>
            </div>`;
  }).join("")}
        </div>
      ` : ""}
    </div>

    ${catalog.length === 0 ? `
      <div class="perf-card">
        <div class="perf-empty">
          <i data-lucide="package-x" size="28"></i>
          <div class="perf-empty-title">No hay esencias disponibles</div>
          <div class="perf-empty-sub">Pronto agregaremos nuevas fragancias.</div>
        </div>
      </div>
    ` : filtered.length === 0 ? `
      <div class="perf-card">
        <div class="perf-empty">
          <i data-lucide="search-x" size="28"></i>
          <div class="perf-empty-title">No se encontraron fragancias</div>
          <div class="perf-empty-sub">No hay resultados para "${esc(state.searchCatalog)}".</div>
          <button class="perf-btn ghost sm" style="margin:12px auto 0" data-action="clear-search-catalog">Ver todo el catálogo</button>
        </div>
      </div>
    ` : `
      <div class="perf-scentgrid">
        ${filtered.map((p) => {
    const sel = getSelection(p.id);
    const sizeKey = sel.mode === "refill" ? sel.refillKey : sel.presKey;
    const info = sizeInfo(sel.mode, sizeKey);
    const ves = unitPriceVES(p, sel.mode, sizeKey);
    const usd = unitPriceUSD(p, sel.mode, sizeKey);
    const already = mlReservedForProduct(p.id);
    const remainingMl = p.stockMl - already;
    return `
          <div class="perf-scent">
            <div class="perf-scent-top">
              <img class="perf-scent-img" src="${p.imagen || PLACEHOLDER_IMG}" alt="${esc(p.nombre)}" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'" />
              <div>
                <div class="perf-scent-name">${highlightMatch(p.nombre, state.searchCatalog)}</div>
                <div class="perf-scent-promo">-20% a partir de 3 unidades</div>
              </div>
            </div>

            <div class="perf-chiprow">
              ${PRESENTATIONS.map((pr) => `
                <button class="perf-chip ${sel.mode === "envase" && sel.presKey === pr.key ? "active" : ""}" ${pr.ml > p.stockMl ? "disabled" : ""} data-action="select-pres" data-id="${p.id}" data-pres="${pr.key}">${pr.label}</button>
              `).join("")}
              <button class="perf-chip ${sel.mode === "refill" ? "active" : ""}" data-action="select-refill-toggle" data-id="${p.id}">Recarga / Refill</button>
            </div>

            ${sel.mode === "refill" ? `
              <div class="perf-chiprow" style="margin-top:6px">
                ${REFILL_SIZES.map((r) => `
                  <button class="perf-chip ${sel.refillKey === r.key ? "active" : ""}" ${r.ml > p.stockMl ? "disabled" : ""} data-action="select-refill-size" data-id="${p.id}" data-refill="${r.key}">${r.label}</button>
                `).join("")}
              </div>` : ""}

            <div class="perf-scent-price-row">
              <div>
                <div class="perf-scent-price-ves">Bs. ${fmt(ves)}</div>
                <div class="perf-scent-price-usd">
                  <span>≈ $${fmt(usd)}</span>
                  <span class="perf-bcv-badge" title="Tasa oficial Banco Central de Venezuela">BCV</span>
                  <span style="margin-left:5px;opacity:0.65">· ${sizeLabel(sel.mode, sizeKey)}</span>
                </div>
              </div>
            </div>

            <div class="perf-scent-bottom">
              <div class="perf-card-hint" style="margin:0">Quedan ${remainingMl}ml disponibles para pedir</div>
              <button class="perf-btn blush" data-action="add-to-cart" data-id="${p.id}" ${info.ml > remainingMl ? "disabled" : ""}><i data-lucide="shopping-bag" size="15"></i> Agregar</button>
            </div>
          </div>`;
  }).join("")}
      </div>
    `}

    <div class="perf-footer">
      <a href="#/login" class="perf-admin-link" data-action="nav-login"><i data-lucide="lock" size="13"></i> Acceso administración</a>
    </div>
  </div>`;
}

function tpl_cartbar() {
  if (state.route !== "catalogo" || cartCount() === 0 || state.cartOpen) return "";
  const t = totals();
  const n = cartCount();
  return `
  <div class="perf-cartbar" data-action="cart-open">
    <div class="perf-cartbar-left"><i data-lucide="shopping-bag" size="18"></i> ${n} ${n === 1 ? "producto" : "productos"}</div>
    <div class="perf-cartbar-right">Bs. ${fmt(t.ves)} <i data-lucide="chevron-up" size="16" style="vertical-align:middle"></i></div>
  </div>`;
}

function tpl_cartsheet() {
  if (!state.cartOpen) return "";
  const lines = cartLines();
  const t = totals();
  const disc = discountApplied();
  return `
  <div class="perf-sheet-backdrop" data-action="backdrop-close">
    <div class="perf-sheet">
      <div class="perf-sheet-head">
        <div class="perf-sheet-title">Tu pedido</div>
        <button class="perf-iconbtn" data-action="cart-close"><i data-lucide="x" size="17"></i></button>
      </div>
      <div class="perf-sheet-body">
        ${disc ? `<div class="perf-discount-banner"><i data-lucide="tag" size="15"></i> ¡Descuento por volumen aplicado! -20% por llevar 3 o más unidades</div>` : ""}
        ${lines.map((l) => `
          <div class="perf-cartitem">
            <div class="perf-cartitem-top">
              <div>
                <div class="perf-cartitem-name">${esc(l.product.nombre)}</div>
                <div class="perf-cartitem-meta">${sizeLabel(l.mode, l.sizeKey)} · Bs. ${fmt(l.unitVES)} c/u (≈ $${fmt(l.unitUSD)} BCV)</div>
              </div>
            </div>
            <div class="perf-cartitem-bottom">
              <div class="perf-stepper">
                <button data-action="cart-qty" data-key="${l.key}" data-delta="-1"><i data-lucide="minus" size="14"></i></button>
                <span>${l.qty}</span>
                <button data-action="cart-qty" data-key="${l.key}" data-delta="1"><i data-lucide="plus" size="14"></i></button>
              </div>
              <div class="perf-cartitem-sub">Bs. ${fmt(l.subVES)}</div>
            </div>
          </div>`).join("")}
      </div>
      <div class="perf-sheet-foot">
        ${disc ? `<div class="perf-total-row"><span>Subtotal antes de descuento</span><span>Bs. ${fmt(t.vesRaw)}</span></div>` : ""}
        <div class="perf-total-row main"><span>Total a pagar</span><span>Bs. ${fmt(t.ves)}</span></div>
        <div class="perf-total-row"><span>Referencia en USD</span><span>$${fmt(t.usd)} <span class="perf-bcv-badge">BCV</span></span></div>
        <a class="perf-btn gold full" style="margin-top:12px;text-decoration:none" href="${buildWhatsAppUrl()}" target="_blank" rel="noopener noreferrer" data-action="send-whatsapp">
          <i data-lucide="send" size="16"></i> Enviar pedido por WhatsApp
        </a>
      </div>
    </div>
  </div>`;
}

function tpl_toast() {
  if (!state.toast) return "";
  return `<div class="perf-toast">${esc(state.toast)}</div>`;
}

// ---------------- render ----------------
function render() {
  const app = document.getElementById("app");
  const active = document.activeElement;
  const activeId = active && active.id;
  const selStart = active && typeof active.selectionStart === "number" ? active.selectionStart : null;
  const selEnd = active && typeof active.selectionEnd === "number" ? active.selectionEnd : null;

  app.innerHTML = `
    ${tpl_toast()}
    ${tpl_header()}
    ${state.route === "login" ? tpl_login() : ""}
    ${state.route === "admin" && state.isAuthenticated ? tpl_admin() : ""}
    ${state.route === "catalogo" ? tpl_catalogo() : ""}
    ${tpl_cartbar()}
    ${tpl_cartsheet()}
  `;

  if (window.lucide) lucide.createIcons();

  if (activeId) {
    const el = document.getElementById(activeId);
    if (el) {
      el.focus();
      if (selStart != null && el.setSelectionRange) {
        try { el.setSelectionRange(selStart, selEnd); } catch (e) { }
      }
    }
  }
}

// ---------------- event delegation ----------------
document.addEventListener("DOMContentLoaded", () => {
  loadState();

  window.addEventListener("hashchange", syncRouteFromHash);

  // Cerrar sugerencias al hacer clic fuera del buscador
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".perf-search-container")) {
      if (state.showCatalogSuggestions || state.showInventorySuggestions) {
        state.showCatalogSuggestions = false;
        state.showInventorySuggestions = false;
        render();
      }
    }
  });

  const app = document.getElementById("app");

  // Enter key in login form
  app.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target && e.target.id === "login-pass") {
      e.preventDefault();
      handleLogin();
    }
  });

  app.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-action]");
    if (!trigger) return;
    const action = trigger.dataset.action;

    // Si es backdrop-close, solo cerrar si el clic fue en el fondo mismo y no dentro de un elemento hijo
    if (action === "backdrop-close" && e.target !== trigger) {
      return;
    }

    switch (action) {
      case "backdrop-close":
      case "cart-close":
        state.cartOpen = false;
        render();
        break;
      case "nav-catalogo":
        navigateTo("catalogo");
        break;
      case "nav-login":
        navigateTo("login");
        break;
      case "do-login":
        handleLogin();
        break;
      case "do-logout":
        handleLogout();
        break;
      case "sync-rates":
        syncLiveRates();
        break;
      case "set-adminsub":
        state.adminSub = trigger.dataset.sub;
        render();
        break;
      case "trigger-upload":
        document.getElementById("newprod-file")?.click();
        break;
      case "trigger-edit-upload":
        document.getElementById("editprod-file")?.click();
        break;
      case "add-product":
        addProduct();
        break;
      case "edit-product":
        startEditProduct(trigger.dataset.id);
        break;
      case "save-edit-product":
        saveEditProduct();
        break;
      case "cancel-edit-product":
        cancelEditProduct();
        break;
      case "adjust-stock":
        adjustStock(trigger.dataset.id, Number(trigger.dataset.delta));
        break;
      case "prompt-custom-stock":
        promptAddCustomStock(trigger.dataset.id);
        break;
      case "add-stock-edit":
        addStockToEditForm(Number(trigger.dataset.amount));
        break;
      case "toggle-edit-custom-prices":
        if (state.editingProd) {
          state.editingProd.customPricesEnabled = !state.editingProd.customPricesEnabled;
          render();
        }
        break;
      case "select-catalog-suggestion":
        selectCatalogSuggestion(trigger.dataset.name);
        break;
      case "select-inventory-suggestion":
        selectInventorySuggestion(trigger.dataset.name);
        break;
      case "clear-search-catalog":
        state.searchCatalog = "";
        state.showCatalogSuggestions = false;
        state.catalogSuggestions = [];
        render();
        break;
      case "clear-search-inventory":
        state.searchInventory = "";
        state.showInventorySuggestions = false;
        state.inventorySuggestions = [];
        render();
        break;
      case "remove-product":
        removeProduct(trigger.dataset.id);
        break;
      case "select-pres":
        setSelPres(trigger.dataset.id, trigger.dataset.pres);
        break;
      case "select-refill-toggle": {
        const sel = getSelection(trigger.dataset.id);
        setSelRefillSize(trigger.dataset.id, sel.refillKey || REFILL_SIZES[0].key);
        break;
      }
      case "select-refill-size":
        setSelRefillSize(trigger.dataset.id, trigger.dataset.refill);
        break;
      case "add-to-cart":
        addToCart(trigger.dataset.id);
        break;
      case "cart-qty":
        changeCartQty(trigger.dataset.key, Number(trigger.dataset.delta));
        break;
      case "cart-open":
        state.cartOpen = true;
        render();
        break;
      case "cart-close":
        state.cartOpen = false;
        render();
        break;
      case "send-whatsapp":
        handleSendClick(e);
        break;
    }
  });

  app.addEventListener("input", (e) => {
    const el = e.target;
    const action = el.dataset.action;

    if (action === "input-login") {
      state.loginInput = el.value;
      if (state.loginError) state.loginError = "";
    } else if (action === "input-search-catalog") {
      handleCatalogSearchInput(el.value);
    } else if (action === "input-search-inventory") {
      handleInventorySearchInput(el.value);
    } else if (action === "input-config") {
      updateConfigField(el.dataset.field, el.value);
    } else if (action === "input-precio") {
      updatePrecioField(el.dataset.field, el.value);
    } else if (action === "input-newprod") {
      state.newProd[el.dataset.field] = el.value;
    } else if (action === "input-editprod" && state.editingProd) {
      state.editingProd[el.dataset.field] = el.value;
    } else if (action === "input-editprod-price" && state.editingProd) {
      state.editingProd.precios[el.dataset.field] = el.value;
    }
  });

  app.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.action === "upload-image") handleImageFile(el.files && el.files[0]);
    if (el.dataset.action === "upload-edit-image") handleEditImageFile(el.files && el.files[0]);
  });
});
