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

const DEFAULT_PRESENTATIONS = [
  { key: "plastico35", label: "Plástico 35ml", ml: 35 },
  { key: "vidrio30", label: "Vidrio 30ml", ml: 30 },
  { key: "vidrio50", label: "Vidrio 50ml", ml: 50 },
  { key: "vidrio60", label: "Vidrio 60ml", ml: 60 },
];

function getPresentations() {
  if (state.config && Array.isArray(state.config.presentaciones) && state.config.presentaciones.length > 0) {
    return state.config.presentaciones;
  }
  return DEFAULT_PRESENTATIONS;
}

const CATEGORIES = [
  { key: "men", label: "Caballeros", icon: "sparkles", match: ["men", "caballero", "hombre"] },
  { key: "dm", label: "Damas", icon: "heart", match: ["dm", "dama", "mujer", "rose", "girl", "belle"] },
  { key: "unisex", label: "Unisex", icon: "feather", match: ["unisex", "amber", "oud"] },
  { key: "otros", label: "Otras Esencias", icon: "droplet", match: [] },
];

function cleanDisplayName(name) {
  if (!name) return "";
  // Quitar sufijos comunes redundantes como " Men", " Dm", " Unisex" al final para el cliente
  return name.replace(/\s+(men|dm|unisex)$/i, "").trim();
}

function getProductCategory(p) {
  if (p && p.categoria && p.categoria.trim()) {
    return p.categoria.trim().toLowerCase();
  }
  // Detección inteligente por nombre
  const nameLower = (p && p.nombre ? p.nombre : "").toLowerCase().trim();
  const lastWord = nameLower.split(" ").pop();
  if (lastWord === "dm" || nameLower.includes(" dm") || nameLower.includes("dama")) return "dm";
  if (lastWord === "men" || nameLower.includes(" men") || nameLower.includes("caballero")) return "men";
  if (lastWord === "unisex" || nameLower.includes("unisex")) return "unisex";
  return "otros";
}
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
  banco: "", // Texto libre retrocompatible
  bancoNombre: "", // Nombre del banco (escrito manualmente por el admin)
  bancoTelefono: "", // Número de teléfono para Pago Móvil
  bancoCedula: "", // Cédula / RIF del titular
  bancoCuenta: "", // Número de cuenta o datos adicionales
  adminPassword: "admin",
  last_rates_update: "0",
  presentaciones: JSON.parse(JSON.stringify(DEFAULT_PRESENTATIONS)),
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
  
  let d;
  if (typeof ts === "string" && isNaN(Number(ts))) {
    // Si era un texto o fecha parseable
    d = new Date(ts);
  } else {
    const num = Number(ts);
    d = new Date(num < 10000000000 ? num * 1000 : num);
  }

  if (!d || isNaN(d.getTime()) || d.getFullYear() < 2026) {
    return "Hoy (en tiempo real)";
  }

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
  cartBankOpen: false, // Desplegable de datos bancarios dentro del carrito
  paymentReceipt: null, // Captura de pago subida por el cliente { name, dataUrl, uploading }
  adminOrders: [], // Pedidos cargados bajo demanda desde Firestore
  loadingOrders: false, // Estado de carga diferida
  viewReceiptModal: null, // Modal para ver la captura a tamaño completo
  notificationBanner: null, // Notificación emergente estilo banner superior { title, message }
  toast: null,
  toastTimer: null,
  newProd: {
    nombre: "",
    stockMl: "",
    imagen: "",
    customPricesEnabled: false,
    precios: { plastico35: "", vidrio30: "", vidrio5060: "", refill: "" }
  },
  newPres: {
    label: "",
    ml: "",
    precioBs: ""
  },
  editingProd: null,
  outOfStockModal: null, // { productName, remainingMl }
  adminRefillMl: "30", // mililitros seleccionados en el panel admin para configurar precio
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
async function syncLiveRates(silent = false) {
  state.syncingRates = true;
  if (!silent) render();

  try {
    let bcvVal = null;
    let binanceVal = null;
    let copVal = null;

    // 1. Intentar consultar endpoint serverless /api/rates
    try {
      const res = await fetch("/api/rates?t=" + Date.now());
      if (res.ok) {
        const json = await res.json();
        if (json.bcv) bcvVal = String(json.bcv);
        if (json.binance) binanceVal = String(json.binance);
        if (json.cop) copVal = String(json.cop);
      }
    } catch (eApi) {}

    // 2. Si no se obtuvo BCV, consultar open.er-api.com (actualizado diariamente)
    if (!bcvVal) {
      try {
        const resEr = await fetch("https://open.er-api.com/v6/latest/USD");
        if (resEr.ok) {
          const d = await resEr.json();
          if (d && d.rates && d.rates.VES && Number(d.rates.VES) > 100) {
            bcvVal = String(Number(d.rates.VES).toFixed(2));
          }
        }
      } catch (eEr) {}
    }

    // 3. Fallback de BCV: DolarApi oficial
    if (!bcvVal) {
      try {
        const resBcv = await fetch("https://ve.dolarapi.com/v1/dolares/oficial");
        if (resBcv.ok) {
          const d = await resBcv.json();
          if (d && d.promedio) bcvVal = String(Number(d.promedio).toFixed(2));
        }
      } catch (eBcv) {}
    }

    // 4. Si no se obtuvo Binance, consultar CriptoYa (Binance P2P VES en vivo)
    if (!binanceVal) {
      try {
        const resCripto = await fetch("https://criptoya.com/api/binancep2p/usdt/ves");
        if (resCripto.ok) {
          const d = await resCripto.json();
          const p = d.bid || d.ask;
          if (p && Number(p) > 100) binanceVal = String(Number(p).toFixed(2));
        }
      } catch (eCrip) {}
    }

    // 5. Fallback de Binance: DolarApi paralelo
    if (!binanceVal) {
      try {
        const resParalelo = await fetch("https://ve.dolarapi.com/v1/dolares/paralelo");
        if (resParalelo.ok) {
          const d = await resParalelo.json();
          if (d && d.promedio) binanceVal = String(Number(d.promedio).toFixed(2));
        }
      } catch (eBin) {}
    }

    // 6. Si no se obtuvo COP, consultar exchange rate API
    if (!copVal) {
      try {
        const resCop = await fetch("https://open.er-api.com/v6/latest/USD");
        if (resCop.ok) {
          const d = await resCop.json();
          if (d && d.rates && d.rates.COP) copVal = String(Number(d.rates.COP).toFixed(2));
        }
      } catch (eCop) {}
    }

    // Aplicar los nuevos valores si se obtuvieron, o mantener los existentes
    if (bcvVal) state.config.bcv = bcvVal;
    if (binanceVal) state.config.binance = binanceVal;
    if (copVal) state.config.cop = copVal;
    state.config.last_rates_update = String(Math.floor(Date.now() / 1000));

    saveLocalBackup();

    if (db) {
      await db.collection("settings").doc("main").set({
        bcv: state.config.bcv,
        binance: state.config.binance,
        cop: state.config.cop,
        last_rates_update: state.config.last_rates_update
      }, { merge: true });
    }

    if (!silent) {
      showToast(`¡Tasas en vivo actualizadas! (BCV: ${state.config.bcv} Bs.)`);
    }
  } catch (e) {
    if (!silent) showToast("Error al sincronizar tasas: " + e.message);
  }

  state.syncingRates = false;
  render();
}

function checkPeriodicRateSync() {
  const last = Number(state.config.last_rates_update) || 0;
  const now = Math.floor(Date.now() / 1000);
  const oneHour = 3600;

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
        presentaciones: Array.isArray(data.presentaciones) && data.presentaciones.length > 0 ? data.presentaciones : DEFAULT_PRESENTATIONS,
        precios: { ...DEFAULT_CONFIG.precios, ...(data.precios || {}) }
      };
      // Verificar si las tasas tienen más de 1 hora de antigüedad
      checkPeriodicRateSync();
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
          categoria: d.categoria || getProductCategory({ nombre: d.nombre }),
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
      state.config = {
        ...DEFAULT_CONFIG,
        ...parsed,
        presentaciones: Array.isArray(parsed.presentaciones) && parsed.presentaciones.length > 0 ? parsed.presentaciones : DEFAULT_PRESENTATIONS,
        precios: { ...DEFAULT_CONFIG.precios, ...(parsed.precios || {}) }
      };
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
  return bcv > 0 ? bcv : 804.81;
}

function tasaBinanceRaw() {
  const bin = Number(state.config.binance) || 0;
  return bin > 0 ? bin : 978.04;
}

function tasaCOP() {
  const cop = Number(state.config.cop) || 0;
  return cop > 0 ? cop : 3152.83;
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
  const presList = getPresentations();
  if (mode === "refill") {
    // Si viene como clave tipo 'refill_50', parseamos los ml
    let ml = 30;
    if (typeof sizeKey === "number") {
      ml = sizeKey;
    } else if (typeof sizeKey === "string" && sizeKey.startsWith("refill_")) {
      ml = parseInt(sizeKey.replace("refill_", ""), 10) || 30;
    } else if (sizeKey === "refill35") {
      ml = 35;
    } else if (sizeKey === "refill30") {
      ml = 30;
    }
    return { key: `refill_${ml}`, label: `${ml}ml`, ml };
  }
  return presList.find((p) => p.key === sizeKey);
}

function sizeLabel(mode, sizeKey) {
  const info = sizeInfo(mode, sizeKey);
  if (!info) return "";
  return mode === "refill" ? `Recarga ${info.label}` : info.label;
}

// Precios base
function unitPriceVES(product, mode, sizeKey) {
  if (mode === "refill") {
    const info = sizeInfo(mode, sizeKey);
    const ml = info ? info.ml : 30;

    // 1. Si el producto tiene precio personalizado para ese refill
    if (product && product.precios) {
      if (Number(product.precios[`refill_${ml}`]) > 0) return Number(product.precios[`refill_${ml}`]);
      if (ml === 30 && Number(product.precios.refill30) > 0) return Number(product.precios.refill30);
      if (ml === 35 && Number(product.precios.refill35) > 0) return Number(product.precios.refill35);
      if (Number(product.precios.refill) > 0) {
        return Math.round((Number(product.precios.refill) / 30) * ml);
      }
    }

    // 2. Si la configuración general tiene precio específico para esta medida en ml
    if (state.config.precios) {
      if (Number(state.config.precios[`refill_${ml}`]) > 0) {
        return Number(state.config.precios[`refill_${ml}`]);
      }
      if (ml === 30 && Number(state.config.precios.refill30) > 0) {
        return Number(state.config.precios.refill30);
      }
      if (ml === 35 && Number(state.config.precios.refill35) > 0) {
        return Number(state.config.precios.refill35);
      }
      // 3. Fallback proporcional sobre la base de refill (30ml)
      const baseRefillVES = Number(state.config.precios.refill) || 8000;
      return Math.round((baseRefillVES / 30) * ml);
    }
    return Math.round((8000 / 30) * ml);
  }

  const key = sizeKey;
  if (product && product.precios) {
    if (Number(product.precios[key]) > 0) return Number(product.precios[key]);
    if ((key === "vidrio50" || key === "vidrio60") && Number(product.precios.vidrio5060) > 0) {
      return Number(product.precios.vidrio5060);
    }
  }
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
  const presList = getPresentations();
  const defaultKey = presList[0]?.key || "plastico35";
  return state.selection[productId] || { mode: "envase", presKey: defaultKey, refillKey: "refill_30", refillMl: 30 };
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

function addCustomPresentation() {
  const label = (state.newPres.label || "").trim();
  const ml = parseInt(state.newPres.ml, 10);
  const precioBs = (state.newPres.precioBs || "").trim();

  if (!label) {
    showToast("Ingresa el nombre o tipo de presentación (ej: Vidrio 100ml)");
    return;
  }
  if (isNaN(ml) || ml <= 0) {
    showToast("Ingresa una cantidad válida de mililitros (ml > 0)");
    return;
  }

  // Generar clave única basada en el nombre y ml
  const cleanKey = "pres_" + normalizeStr(label).replace(/[^a-z0-9]/g, "") + "_" + ml;
  const currentList = [...getPresentations()];

  if (currentList.some((p) => p.key === cleanKey)) {
    showToast("Ya existe una presentación similar");
    return;
  }

  const newPresObj = { key: cleanKey, label: `${label} ${ml}ml`, ml };
  currentList.push(newPresObj);

  if (!state.config.presentaciones) {
    state.config.presentaciones = [];
  }
  state.config.presentaciones = currentList;

  // Asignar precio base si fue provisto
  if (precioBs && !isNaN(Number(precioBs))) {
    state.config.precios[cleanKey] = precioBs;
  }

  state.newPres = { label: "", ml: "", precioBs: "" };
  saveConfig();
  showToast(`Presentación "${newPresObj.label}" agregada`);
  render();
}

function removeCustomPresentation(presKey) {
  const currentList = getPresentations();
  const pres = currentList.find((p) => p.key === presKey);
  if (!pres) return;

  if (currentList.length <= 1) {
    showToast("Debes mantener al menos una presentación disponible");
    return;
  }

  if (!confirm(`¿Eliminar la presentación "${pres.label}"?`)) return;

  state.config.presentaciones = currentList.filter((p) => p.key !== presKey);
  if (state.config.precios && state.config.precios[presKey]) {
    delete state.config.precios[presKey];
  }

  saveConfig();
  showToast(`Presentación "${pres.label}" eliminada`);
  render();
}

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
  const categoria = state.newProd.categoria || getProductCategory({ nombre });
  const precios = state.newProd.customPricesEnabled ? { ...state.newProd.precios } : null;

  const newProductObj = { id: newId, nombre, imagen, categoria, stockMl, precios, createdAt: Date.now() };

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
    categoria: "men",
    stockMl: "",
    imagen: "",
    customPricesEnabled: false,
    precios: { plastico35: "", vidrio30: "", vidrio50: "", vidrio60: "", refill: "" }
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
    categoria: p.categoria || getProductCategory(p),
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
  const { id, nombre, categoria, stockMl, imagen, newBase64, customPricesEnabled, precios } = state.editingProd;
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
    categoria: categoria || getProductCategory({ nombre: cleanName }),
    stockMl: cleanStock,
    imagen: imageToSend,
    precios: cleanPrices
  };

  if (db && state.isAuthenticated) {
    try {
      await db.collection("products").doc(id).set(updatedData, { merge: true });
      showToast("Cambios guardados con éxito");
    } catch (e) {
      showToast("Error actualizando: " + e.message);
    }
  } else {
    const idx = state.inventory.findIndex((x) => x.id === id);
    if (idx !== -1) {
      state.inventory[idx] = { ...state.inventory[idx], ...updatedData };
      saveLocalBackup();
      showToast("Producto actualizado");
    }
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
  const ml = parseInt(String(refillKey).replace("refill_", ""), 10) || 30;
  state.selection[productId] = { ...getSelection(productId), refillKey: `refill_${ml}`, refillMl: ml, mode: "refill" };
  render();
}

function setSelRefillMl(productId, mlVal) {
  const ml = Math.max(10, Math.min(200, parseInt(mlVal, 10) || 30));
  state.selection[productId] = { ...getSelection(productId), refillKey: `refill_${ml}`, refillMl: ml, mode: "refill" };
  render();
}

function addToCart(productId) {
  const product = state.inventory.find((p) => p.id === productId);
  if (!product) return;
  const sel = getSelection(productId);
  const sizeKey = sel.mode === "refill" ? sel.refillKey : sel.presKey;
  const info = sizeInfo(sel.mode, sizeKey);
  const already = mlReservedForProduct(productId);
  const remaining = product.stockMl - already;

  if (remaining <= 0 || already + info.ml > product.stockMl) {
    state.outOfStockModal = {
      productName: cleanDisplayName(product.nombre),
      imagen: product.imagen || PLACEHOLDER_IMG,
      remainingMl: Math.max(0, remaining),
      requestedMl: info ? info.ml : 0,
      presLabel: sizeLabel(sel.mode, sizeKey)
    };
    render();
    return;
  }

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
  if (lines.length === 0) return "";
  const t = totals();
  const totalQty = cartCount();

  // Formatear cada línea: "(cantidad) (producto) (n)ml Bs. (precio)"
  const formattedLines = lines.map((l) => {
    const mlNum = l.info?.ml || 35;
    const name = cleanDisplayName(l.product.nombre);
    return `${l.qty} ${name} ${mlNum}ml Bs. ${fmt(l.subVES)}`;
  });

  let msg = "";
  if (formattedLines.length === 1) {
    // Un solo producto: (cantidad) producto (n)ml Bs. (precio) = $ (precio en dolares) bcv
    msg = `${formattedLines[0]} = $${fmt(t.usd)} bcv`;
  } else {
    // Múltiples productos: item1 + item2 + ... = (cantidad total) Bs. (precio total) = $(precio en dolares) bcv
    const equation = formattedLines.join(" + ");
    msg = `${equation} = ${totalQty} ${totalQty === 1 ? "producto" : "productos"} Bs. ${fmt(t.ves)} = $${fmt(t.usd)} bcv`;
  }

  if (discountApplied()) {
    msg += `\n(Descuento 20% aplicado)`;
  }

  return msg;
}

function buildWhatsAppUrl() {
  const digits = (state.config.whatsapp || "").replace(/\D/g, "");
  if (!digits || cartLines().length === 0) return "#";
  return `https://wa.me/${digits}?text=${encodeURIComponent(buildWhatsAppMessage())}`;
}

// Comprimir imagen de captura de pago antes de guardarla en Firebase
function handlePaymentReceiptFile(file) {
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    showToast("La captura es muy pesada. Usa una menor a 8MB.");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // Redimensionar si es muy grande para optimizar Firestore (máx 1000px de ancho/alto)
      const maxDim = 1000;
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      // Calidad JPEG comprimida al 70% (~80-150KB)
      const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7);
      state.paymentReceipt = {
        name: file.name,
        dataUrl: compressedBase64
      };

      // Disparar pop-up que baja desde arriba notificando al cliente
      state.notificationBanner = {
        title: "¡Captura de pago adjuntada!",
        message: "Envía el pedido a WhatsApp para notificarnos de tu orden y verificar tu pago."
      };
      setTimeout(() => {
        if (state.notificationBanner) {
          state.notificationBanner = null;
          render();
        }
      }, 7000);

      render();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removePaymentReceipt() {
  state.paymentReceipt = null;
  render();
}

async function handleSendClick(e) {
  if (!state.config.whatsapp) {
    e.preventDefault();
    showToast("Configura tu número de WhatsApp en Panel Admin > Datos");
    return;
  }
  const lines = cartLines();
  if (lines.length === 0) { e.preventDefault(); return; }

  // Exigir captura de pago de forma obligatoria
  if (!state.paymentReceipt || !state.paymentReceipt.dataUrl) {
    e.preventDefault();
    showToast("Debes subir la captura de pago para continuar con el pedido");
    const receiptBtn = document.querySelector(".perf-upload-receipt-btn");
    if (receiptBtn) {
      receiptBtn.classList.add("shake");
      setTimeout(() => receiptBtn.classList.remove("shake"), 600);
    }
    return;
  }

  const t = totals();
  const disc = discountApplied();
  const orderId = uid();

  // 1. Guardar el pedido en Firestore (colección 'orders')
  const orderData = {
    id: orderId,
    createdAt: Date.now(),
    status: "sin_pagar", // 'sin_pagar' | 'pagado'
    items: lines.map((l) => ({
      productId: l.product.id,
      nombre: l.product.nombre,
      imagen: l.product.imagen || PLACEHOLDER_IMG,
      sizeKey: l.sizeKey,
      mode: l.mode,
      sizeLabel: sizeLabel(l.mode, l.sizeKey),
      qty: l.qty,
      unitVES: l.unitVES,
      subVES: l.subVES
    })),
    totalItems: cartCount(),
    vesTotal: t.ves,
    usdTotal: t.usd,
    discountApplied: disc,
    paymentReceipt: state.paymentReceipt ? state.paymentReceipt.dataUrl : ""
  };

  if (db) {
    try {
      await db.collection("orders").doc(orderId).set(orderData);
    } catch (err) {
      console.warn("Error guardando pedido en Firebase:", err);
    }
  }

  // El stock ya NO se descuenta aquí, se descuenta únicamente cuando el admin verifique el pago y cambie el estado a 'pagado'
  state.cart = {};
  state.paymentReceipt = null;
  state.cartOpen = false;
  showToast("¡Pedido registrado! Abriendo WhatsApp...");
}

// Carga diferida de pedidos (solo cuando el admin consulta la pestaña 'pedidos')
async function fetchAdminOrders() {
  if (!db || !state.isAuthenticated) return;
  state.loadingOrders = true;
  render();

  try {
    const snapshot = await db.collection("orders").orderBy("createdAt", "desc").limit(100).get();
    const orders = [];
    snapshot.forEach((doc) => {
      orders.push(doc.data());
    });
    state.adminOrders = orders;
  } catch (err) {
    console.error("Error consultando pedidos:", err);
    showToast("Error al cargar pedidos: " + err.message);
  } finally {
    state.loadingOrders = false;
    render();
  }
}

async function updateOrderStatus(orderId, newStatus) {
  if (!db || !state.isAuthenticated) return;
  const ord = state.adminOrders.find((o) => o.id === orderId);
  if (!ord) return;

  const prevStatus = ord.status;
  if (prevStatus === newStatus) return;

  try {
    // 1. Si pasa a "pagado", descontamos los ml del inventario
    if (newStatus === "pagado" && prevStatus !== "pagado") {
      const items = ord.items || [];
      for (const it of items) {
        const p = state.inventory.find((x) => x.id === it.productId);
        const info = sizeInfo(it.mode, it.sizeKey);
        const mlToDeduct = (info?.ml || 30) * (it.qty || 1);
        if (p) {
          const nextStock = Math.max(0, p.stockMl - mlToDeduct);
          await db.collection("products").doc(p.id).update({ stockMl: nextStock });
        }
      }
      showToast("¡Pago verificado! Stock de mililitros descontado");
    }
    // 2. Si se revierte de "pagado" a "sin_pagar", se restaura el stock correspondiente
    else if (newStatus === "sin_pagar" && prevStatus === "pagado") {
      const items = ord.items || [];
      for (const it of items) {
        const p = state.inventory.find((x) => x.id === it.productId);
        const info = sizeInfo(it.mode, it.sizeKey);
        const mlToRestore = (info?.ml || 30) * (it.qty || 1);
        if (p) {
          const nextStock = p.stockMl + mlToRestore;
          await db.collection("products").doc(p.id).update({ stockMl: nextStock });
        }
      }
      showToast("Estado cambiado a Sin pagar (stock restaurado)");
    }

    await db.collection("orders").doc(orderId).update({ status: newStatus });
    ord.status = newStatus;
    render();
  } catch (err) {
    showToast("Error actualizando estatus: " + err.message);
  }
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
      <div class="perf-promo-banner">
        <i data-lucide="tag" size="14"></i>
        <span>¡Promoción activa! <b>-20% de descuento</b> a partir de 3 unidades</span>
      </div>
    </div>`;
  }
  if (state.route === "admin") {
    return `
    <div class="perf-header perf-admin-header">
      <div class="perf-header-top">
        <div>
          <div class="perf-title" style="font-size:24px">Panel de Control</div>
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
    ["pedidos", "Pedidos"],
    ["tasas", "Tasas"],
    ["precios", "Precios (Bs.)"],
    ["inventario", "Inventario"],
    ["datos", "Datos & Banco"],
  ];
  return `
  <div class="perf-subtabs">
    ${subtabs.map(([k, label]) => `<button class="perf-subtab ${state.adminSub === k ? "active" : ""}" data-action="set-adminsub" data-sub="${k}">
      ${k === "pedidos" ? `<i data-lucide="receipt" size="14" style="margin-right:4px"></i>` : ""}
      ${label}
    </button>`).join("")}
  </div>
  ${state.adminSub === "pedidos" ? tpl_admin_pedidos() : ""}
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

function tpl_price_conversions(ves) {
  const bcv = tasaBCV();
  const binance = tasaBinanceRaw();
  const venta = tasaVenta();
  const copRate = tasaCOP();

  const valBCV = bcv > 0 ? ves / bcv : 0;
  const valBinance = binance > 0 ? ves / binance : 0;
  const valVenta = venta > 0 ? ves / venta : 0;
  const valCOP = valBCV > 0 && copRate > 0 ? valBCV * copRate : 0;

  return `
  <div class="perf-ref-grid">
    <div class="perf-ref-pill bcv" title="Referencia según tasa oficial BCV (${fmt(bcv)} Bs.)">
      <span class="lbl">BCV</span>
      <span class="val">$${fmt(valBCV)}</span>
    </div>
    <div class="perf-ref-pill binance" title="Referencia según tasa Binance P2P base (${fmt(binance)} Bs.)">
      <span class="lbl">USDT</span>
      <span class="val">$${fmt(valBinance)}</span>
    </div>
    <div class="perf-ref-pill venta" title="Referencia según tasa personal con tus puntos agregados (${fmt(venta)} Bs.)">
      <span class="lbl">Personal</span>
      <span class="val">$${fmt(valVenta)}</span>
    </div>
    <div class="perf-ref-pill cop" title="Referencia aproximada en Pesos Colombianos (COP)">
      <span class="lbl">COP</span>
      <span class="val">${fmt(valCOP, 0)}</span>
    </div>
  </div>`;
}

function tpl_admin_precios() {
  const bcv = tasaBCV();
  const binance = tasaBinanceRaw();
  const venta = tasaVenta();
  const presList = getPresentations();

  return `
  <div class="perf-section">
    <div class="perf-card">
      <div class="perf-card-title"><i data-lucide="tag" size="16"></i> Configuración de Precios por Presentación</div>
      <div class="perf-card-hint">Edita los precios base en Bolívares (Bs.). Las equivalencias en dólares y pesos colombianos se calculan automáticamente con las tasas vigentes. Al agregar una presentación, sus ml exactos se descuentan automáticamente del inventario al realizar pedidos.</div>
      
      <div class="perf-table-wrapper">
        <table class="perf-table">
          <thead>
            <tr>
              <th>Presentación / Tipo</th>
              <th>Mililitros</th>
              <th style="min-width:130px">Precio Base (Bs.)</th>
              <th style="min-width:180px">Referencias Multi-Divisa</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody>
            ${presList.map((p) => {
              const vesVal = Number(state.config.precios[p.key]) || 0;
              return `
              <tr>
                <td>
                  <strong style="color:#ffffff;display:block">${p.label}</strong>
                </td>
                <td><span style="font-family:'IBM Plex Mono',monospace;color:rgba(248,250,252,0.75)">${p.ml} ml</span></td>
                <td>
                  <input id="precio-${p.key}" class="perf-table-input" inputmode="decimal" placeholder="Bs." value="${esc(state.config.precios[p.key])}" data-action="input-precio" data-field="${p.key}" />
                </td>
                <td>
                  ${tpl_price_conversions(vesVal)}
                </td>
                <td style="text-align:center">
                  ${presList.length > 1 ? `
                    <button class="perf-iconbtn danger xs" data-action="remove-pres" data-key="${p.key}" title="Eliminar presentación">
                      <i data-lucide="trash-2" size="13"></i>
                    </button>
                  ` : ""}
                </td>
              </tr>`;
            }).join("")}
            <!-- Fila Interactiva de Precios para Recargas con Desplegable de ML -->
            ${(() => {
              const currentRefillMl = parseInt(state.adminRefillMl, 10) || 30;
              const fieldKey = `refill_${currentRefillMl}`;
              
              // Determinar el valor actual: si tiene precio explícito, o si es 30/35 legacy, o cálculo proporcional
              let currentVal = "";
              if (state.config.precios && state.config.precios[fieldKey] != null && state.config.precios[fieldKey] !== "") {
                currentVal = state.config.precios[fieldKey];
              } else if (currentRefillMl === 30 && state.config.precios && state.config.precios.refill) {
                currentVal = state.config.precios.refill;
              } else if (state.config.precios && state.config.precios.refill) {
                // Cálculo sugerido proporcional si no ha sido guardado
                currentVal = Math.round((Number(state.config.precios.refill) / 30) * currentRefillMl);
              }

              const vesNum = Number(currentVal) || 0;

              return `
              <tr style="background:rgba(56,189,248,0.06);border-top:1px solid var(--line-strong)">
                <td>
                  <strong style="color:#ffffff;display:flex;align-items:center;gap:6px">
                    <i data-lucide="droplet" size="14" style="color:var(--accent-cyan)"></i> Recarga por ML
                  </strong>
                  <span style="font-size:11px;color:rgba(248,250,252,0.6)">Selecciona la medida en el desplegable ➔</span>
                </td>
                <td>
                  <div style="display:flex;align-items:center;gap:6px">
                    <select class="perf-table-input" style="padding:6px 10px;max-width:115px;cursor:pointer;background:var(--navy-dark);border-color:var(--accent-cyan);color:var(--accent-cyan);font-weight:800" data-action="change-admin-refill-ml">
                      ${[30, 35, 50, 60, 100].map((ml) => `
                        <option value="${ml}" ${ml === currentRefillMl ? "selected" : ""}>
                          ${ml} ml
                        </option>
                      `).join("")}
                    </select>
                  </div>
                </td>
                <td>
                  <input 
                    id="precio-refill-ml" 
                    class="perf-table-input" 
                    inputmode="decimal" 
                    placeholder="Bs." 
                    value="${esc(currentVal)}" 
                    data-action="input-refill-price" 
                    data-ml="${currentRefillMl}" 
                    title="Precio en Bs. para recarga de ${currentRefillMl}ml"
                  />
                </td>
                <td>
                  ${tpl_price_conversions(vesNum)}
                </td>
                <td style="text-align:center">
                  <span class="perf-bcv-badge" style="margin:0;font-size:9px" title="Precio guardado para ${currentRefillMl}ml">
                    ${currentRefillMl}ml
                  </span>
                </td>
              </tr>`;
            })()}
          </tbody>
        </table>
      </div>
      <div class="perf-card-hint" style="margin-top:12px;font-size:11.5px;color:rgba(248,250,252,0.5)">* Puedes cambiar la medida en el desplegable de Recargas para ajustar el precio individual de cada tamaño (30, 35, 50, 60 y 100ml). Se guarda automáticamente en tiempo real.</div>
    </div>

    <!-- Formulario para Agregar Nueva Presentación -->
    <div class="perf-card">
      <div class="perf-card-title"><i data-lucide="plus-circle" class="perf-drop" size="16"></i> Agregar Nueva Presentación / Envase</div>
      <div class="perf-card-hint">Crea una nueva opción (ej: Vidrio 100ml, Plástico 20ml, Decant 10ml). Los mililitros que asignes se descontarán automáticamente del stock de cada esencia cuando un cliente haga un pedido.</div>
      
      <div class="perf-row" style="margin-top:10px">
        <div class="perf-field" style="flex:2">
          <label class="perf-label"><span>Nombre / Tipo</span></label>
          <input class="perf-input text" placeholder="Ej: Vidrio Lujo, Decant, Atomizador..." value="${esc(state.newPres.label)}" data-action="input-newpres" data-field="label" />
        </div>
        <div class="perf-field" style="flex:1">
          <label class="perf-label"><span>Mililitros (ml)</span></label>
          <input class="perf-input" inputmode="numeric" placeholder="Ej: 100" value="${esc(state.newPres.ml)}" data-action="input-newpres" data-field="ml" />
        </div>
        <div class="perf-field" style="flex:1.2">
          <label class="perf-label"><span>Precio Base (Bs.)</span></label>
          <input class="perf-input" inputmode="decimal" placeholder="Ej: 22000" value="${esc(state.newPres.precioBs)}" data-action="input-newpres" data-field="precioBs" />
        </div>
      </div>

      <button class="perf-btn gold" style="margin-top:12px;width:100%" data-action="submit-newpres">
        <i data-lucide="plus" size="15"></i> Agregar esta Presentación al Catálogo
      </button>
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

        <div class="perf-row">
          <div class="perf-field" style="flex:1">
            <label class="perf-label"><span>Categoría de fragancia</span></label>
            <select class="perf-input text" data-action="input-editprod" data-field="categoria" style="padding:10px 12px;cursor:pointer">
              ${CATEGORIES.map((c) => `<option value="${c.key}" ${ep.categoria === c.key ? "selected" : ""}>${c.label}</option>`).join("")}
            </select>
          </div>
          <div class="perf-field" style="flex:1">
            <label class="perf-label"><span>Stock total (ml)</span></label>
            <input id="editprod-stockml" class="perf-input" inputmode="numeric" placeholder="Ej: 500" value="${esc(ep.stockMl)}" data-action="input-editprod" data-field="stockMl" />
          </div>
        </div>
        <div style="margin:-6px 0 12px">
          <span style="font-size:11.5px;color:rgba(248,250,252,0.55)">Sumar ml rápidamente:</span>
          <div class="perf-quick-add-group">
            <button type="button" class="perf-quick-add-btn" data-action="add-stock-edit" data-amount="10">+10 ml</button>
            <button type="button" class="perf-quick-add-btn" data-action="add-stock-edit" data-amount="50">+50 ml</button>
            <button type="button" class="perf-quick-add-btn" data-action="add-stock-edit" data-amount="100">+100 ml</button>
            <button type="button" class="perf-quick-add-btn" data-action="add-stock-edit" data-amount="250">+250 ml</button>
            <button type="button" class="perf-quick-add-btn" data-action="add-stock-edit" data-amount="500">+500 ml</button>
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
        <div class="perf-row">
          <div class="perf-field" style="flex:1">
            <label class="perf-label"><span>Categoría</span></label>
            <select class="perf-input text" data-action="input-newprod" data-field="categoria" style="padding:10px 12px;cursor:pointer">
              ${CATEGORIES.map((c) => `<option value="${c.key}" ${state.newProd.categoria === c.key ? "selected" : ""}>${c.label}</option>`).join("")}
            </select>
          </div>
          <div class="perf-field" style="flex:1">
            <label class="perf-label"><span>Stock inicial (ml)</span></label>
            <input id="newprod-stockml" class="perf-input" inputmode="numeric" placeholder="Ej: 500" value="${esc(state.newProd.stockMl)}" data-action="input-newprod" data-field="stockMl" />
          </div>
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
      <div class="perf-card-title"><i data-lucide="landmark" size="16"></i> Datos bancarios y Pago Móvil</div>
      <div class="perf-card-hint" style="margin-bottom:12px">Estos datos se mostrarán en un botón desplegable con opción de copiar en el carrito del cliente y al final del pedido por WhatsApp.</div>
      
      <div class="perf-row2">
        <div class="perf-field">
          <label class="perf-label"><span>Banco (Nombre de la entidad)</span></label>
          <input id="cfg-banconombre" class="perf-input text" placeholder="Ej: Banesco, BDV, Mercantil, BNC..." value="${esc(state.config.bancoNombre)}" data-action="input-config" data-field="bancoNombre" />
        </div>
        <div class="perf-field">
          <label class="perf-label"><span>Número de teléfono (Pago Móvil)</span></label>
          <input id="cfg-bancotelefono" class="perf-input" inputmode="numeric" placeholder="Ej: 04141234567" value="${esc(state.config.bancoTelefono)}" data-action="input-config" data-field="bancoTelefono" />
        </div>
      </div>

      <div class="perf-row2" style="margin-top:10px">
        <div class="perf-field">
          <label class="perf-label"><span>Cédula o RIF</span></label>
          <input id="cfg-bancocedula" class="perf-input" placeholder="Ej: V-12345678 o J-123456789" value="${esc(state.config.bancoCedula)}" data-action="input-config" data-field="bancoCedula" />
        </div>
        <div class="perf-field">
          <label class="perf-label"><span>Número de cuenta bancaria</span></label>
          <input id="cfg-bancocuenta" class="perf-input" inputmode="numeric" placeholder="Ej: 0134 0000 00 0000000000" value="${esc(state.config.bancoCuenta)}" data-action="input-config" data-field="bancoCuenta" />
        </div>
      </div>
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

function tpl_admin_pedidos() {
  if (state.loadingOrders) {
    return `
    <div class="perf-section">
      <div class="perf-card" style="text-align:center;padding:40px 20px">
        <i data-lucide="refresh-cw" class="perf-spin" size="30" style="color:var(--gold);margin-bottom:12px"></i>
        <div style="font-weight:700;font-size:15px;color:#ffffff">Cargando pedidos de la nube...</div>
        <div style="font-size:12px;color:rgba(248,250,252,0.5);margin-top:4px">Consultando Firestore bajo demanda</div>
      </div>
    </div>`;
  }

  const orders = state.adminOrders || [];

  return `
  <div class="perf-section">
    <div class="perf-orders-toolbar">
      <div>
        <div class="perf-orders-title"><i data-lucide="inbox" size="18"></i> Gestión de Pedidos (${orders.length})</div>
        <div class="perf-orders-subtitle">Verifica los comprobantes bancarios y actualiza el estado de cada pago</div>
      </div>
      <button class="perf-btn gold sm" data-action="refresh-orders" title="Actualizar pedidos de la nube">
        <i data-lucide="refresh-cw" size="14"></i> Actualizar
      </button>
    </div>

    ${orders.length === 0 ? `
      <div class="perf-card">
        <div class="perf-empty">
          <i data-lucide="shopping-bag" size="32"></i>
          <div class="perf-empty-title">Sin pedidos registrados</div>
          <div class="perf-empty-sub">Cuando los clientes pulsen "Enviar pedido por WhatsApp" en el catálogo, sus pedidos y capturas de pago aparecerán aquí.</div>
        </div>
      </div>
    ` : `
      <div class="perf-orders-list">
        ${orders.map((ord) => {
          const isPaid = ord.status === "pagado";
          const dateStr = ord.createdAt ? new Date(ord.createdAt).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" }) : "Reciente";
          const items = ord.items || [];
          const totalQty = ord.totalItems || items.reduce((s, i) => s + (i.qty || 1), 0);

          return `
          <div class="perf-order-card ${isPaid ? "paid" : "unpaid"}">
            <div class="perf-order-header">
              <div class="perf-order-id-wrap">
                <span class="perf-order-id">#${String(ord.id).slice(-6).toUpperCase()}</span>
                <span class="perf-order-date">${dateStr}</span>
              </div>
              <div class="perf-order-status-selector">
                <select class="perf-status-select ${isPaid ? "paid" : "unpaid"}" data-action="change-order-status" data-id="${ord.id}">
                  <option value="sin_pagar" ${!isPaid ? "selected" : ""}>⏳ Sin pagar</option>
                  <option value="pagado" ${isPaid ? "selected" : ""}>✅ Pagado</option>
                </select>
              </div>
            </div>

            <div class="perf-order-body">
              <div class="perf-order-products-row">
                <!-- Miniaturas agrupadas de los perfumes pedidos -->
                <div class="perf-order-thumbs-cluster">
                  ${items.slice(0, 4).map((it) => `
                    <img src="${it.imagen || PLACEHOLDER_IMG}" class="perf-order-cluster-img" alt="${esc(it.nombre)}" title="${esc(it.nombre)} x${it.qty}" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'" />
                  `).join("")}
                  ${items.length > 4 ? `
                    <span class="perf-order-cluster-more">+${items.length - 4}</span>
                  ` : ""}
                </div>

                <!-- Detalle de texto de productos pedidos -->
                <div class="perf-order-details-col">
                  <div class="perf-order-item-count">
                    <strong>${totalQty} ${totalQty === 1 ? "producto pedido" : "productos pedidos"}</strong>
                  </div>
                  <div class="perf-order-items-snippet">
                    ${items.map((it) => `${esc(it.nombre)} (${it.sizeLabel || it.mode} x${it.qty})`).join(", ")}
                  </div>
                </div>
              </div>

              <!-- Fila de Total a pagar y Botón de Captura -->
              <div class="perf-order-foot-row">
                <div class="perf-order-total-block">
                  <span class="lbl">Total a pagar:</span>
                  <div class="perf-order-ves">Bs. ${fmt(ord.vesTotal || 0)}</div>
                  <span class="perf-order-usd">≈ $${fmt(ord.usdTotal || 0)} BCV</span>
                </div>

                <div class="perf-order-receipt-action">
                  ${ord.paymentReceipt ? `
                    <button type="button" class="perf-btn blush sm" data-action="view-receipt" data-src="${ord.paymentReceipt}">
                      <i data-lucide="eye" size="14"></i> Ver captura de pantalla
                    </button>
                  ` : `
                    <span class="perf-badge-no-receipt"><i data-lucide="image-off" size="12"></i> Sin captura</span>
                  `}
                </div>
              </div>
            </div>
          </div>`;
        }).join("")}
      </div>
    `}
  </div>`;
}

function tpl_receipt_modal() {
  const src = state.viewReceiptModal;
  if (!src) return "";

  return `
  <div class="perf-modal-backdrop" data-action="close-receipt-modal">
    <div class="perf-modal-box perf-receipt-lightbox" onclick="event.stopPropagation()">
      <div class="perf-lightbox-head">
        <div style="font-weight:700;font-size:15px;color:#ffffff;display:flex;align-items:center;gap:6px">
          <i data-lucide="receipt" size="16" style="color:var(--gold)"></i> Comprobante de Pago
        </div>
        <button class="perf-iconbtn" data-action="close-receipt-modal"><i data-lucide="x" size="17"></i></button>
      </div>
      <div class="perf-lightbox-body">
        <img src="${src}" class="perf-lightbox-img" alt="Comprobante de pago" />
      </div>
      <div class="perf-lightbox-foot">
        <a href="${src}" download="comprobante_pago.jpg" class="perf-btn ghost sm" target="_blank" rel="noopener noreferrer">
          <i data-lucide="download" size="14"></i> Descargar imagen
        </a>
        <button class="perf-btn gold sm" data-action="close-receipt-modal">Cerrar</button>
      </div>
    </div>
  </div>`;
}

function tpl_product_card(p) {
  const sel = getSelection(p.id);
  const sizeKey = sel.mode === "refill" ? sel.refillKey : sel.presKey;
  const info = sizeInfo(sel.mode, sizeKey);
  const ves = unitPriceVES(p, sel.mode, sizeKey);
  const usd = unitPriceUSD(p, sel.mode, sizeKey);
  const already = mlReservedForProduct(p.id);
  const remainingMl = p.stockMl - already;

  return `
  <div class="perf-carousel-card">
    <div class="perf-scent-top">
      <img class="perf-scent-img" src="${p.imagen || PLACEHOLDER_IMG}" alt="${esc(p.nombre)}" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'" />
      <div style="flex:1;min-width:0">
        <div class="perf-scent-name" style="font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${highlightMatch(cleanDisplayName(p.nombre), state.searchCatalog)}</div>
      </div>
    </div>

    <div class="perf-chiprow" style="margin-top:10px">
      ${getPresentations().map((pr) => `
        <button class="perf-chip ${sel.mode === "envase" && sel.presKey === pr.key ? "active" : ""}" ${pr.ml > p.stockMl ? "disabled" : ""} data-action="select-pres" data-id="${p.id}" data-pres="${pr.key}">${pr.label}</button>
      `).join("")}
      <button class="perf-chip ${sel.mode === "refill" ? "active" : ""}" data-action="select-refill-toggle" data-id="${p.id}">
        <i data-lucide="droplet" size="13" style="margin-right:2px"></i> Recarga ${sel.mode === "refill" ? "▾" : ""}
      </button>
    </div>

    ${sel.mode === "refill" ? `
      <div class="perf-refill-dropdown-panel" style="margin-top:10px">
        <div class="perf-refill-panel-header">
          <span class="perf-refill-panel-title">Selecciona los mililitros para la recarga:</span>
        </div>
        <div class="perf-refill-buttons-row">
          ${[30, 35, 50, 60, 100].map((mlVal) => {
            const isSel = Number(sel.refillMl || 30) === mlVal;
            const noStock = mlVal > p.stockMl;
            return `
            <button 
              type="button" 
              class="perf-refill-btn ${isSel ? "active" : ""}" 
              ${noStock ? "disabled" : ""} 
              data-action="select-refill-ml" 
              data-id="${p.id}" 
              data-ml="${mlVal}"
              title="${noStock ? "No hay suficiente stock en ml" : `Recargar ${mlVal} ml`}"
            >
              ${mlVal} ml
            </button>`;
          }).join("")}
        </div>
      </div>` : ""}

    <div class="perf-scent-price-row" style="margin-top:10px">
      <div>
        <div class="perf-scent-price-ves" style="font-size:18px">Bs. ${fmt(ves)}</div>
        <div class="perf-scent-price-usd">
          <span>≈ $${fmt(usd)}</span>
          <span class="perf-bcv-badge" title="Tasa oficial Banco Central de Venezuela">BCV</span>
          <span style="margin-left:4px;opacity:0.65">· ${sizeLabel(sel.mode, sizeKey)}</span>
        </div>
      </div>
    </div>

    <div class="perf-scent-bottom" style="margin-top:10px">
      <div class="perf-card-hint" style="margin:0;font-size:11px">
        ${remainingMl <= 0 ? `<span style="color:var(--warn);font-weight:700">Agotado temporalmente</span>` : `Quedan ${remainingMl}ml disponibles`}
      </div>
      <button class="perf-btn ${remainingMl <= 0 ? "outline" : "blush"} sm" data-action="add-to-cart" data-id="${p.id}" style="padding:7px 14px">
        <i data-lucide="${remainingMl <= 0 ? "alert-circle" : "shopping-bag"}" size="14"></i> ${remainingMl <= 0 ? "Agotado" : "Agregar"}
      </button>
    </div>
  </div>`;
}

function tpl_catalogo() {
  const catalog = state.inventory;
  const q = normalizeStr(state.searchCatalog);
  const filtered = catalog.filter((p) => normalizeStr(p.nombre).includes(q));

  // Agrupar por categoría
  const groups = { men: [], dm: [], unisex: [], otros: [] };
  filtered.forEach((p) => {
    const cat = getProductCategory(p);
    if (groups[cat]) {
      groups[cat].push(p);
    } else {
      groups.otros.push(p);
    }
  });

  return `
  <!-- Buscador Estático Sticky con Transparencia y Blur detrás -->
  <div class="perf-sticky-search">
    <div class="perf-search-container">
      <div class="perf-searchbox">
        <i data-lucide="search" class="perf-search-icon" size="16"></i>
        <input type="text" id="catalog-search-input" class="perf-search-input" placeholder="Buscar fragancia o marca..." value="${esc(state.searchCatalog)}" data-action="input-search-catalog" autocomplete="off" />
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
  </div>

  <div class="perf-section">
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
      <!-- Carruseles agrupados por Categorías -->
      ${CATEGORIES.map((cat) => {
        const items = groups[cat.key] || [];
        if (items.length === 0) return "";
        return `
        <div class="perf-category-section">
          <div class="perf-category-header">
            <div class="perf-category-title">
              <i data-lucide="${cat.icon}" size="18"></i>
              <span>${cat.label}</span>
            </div>
            <span class="perf-category-badge">${items.length} ${items.length === 1 ? "esencia" : "esencias"}</span>
          </div>

          <div class="perf-carousel-wrapper">
            <button class="perf-carousel-arrow left" data-action="scroll-carousel" data-target="track-${cat.key}" data-dir="-1" title="Anterior"><i data-lucide="chevron-left" size="20"></i></button>
            <div id="track-${cat.key}" class="perf-carousel-track">
              ${items.map((p) => tpl_product_card(p)).join("")}
            </div>
            <button class="perf-carousel-arrow right" data-action="scroll-carousel" data-target="track-${cat.key}" data-dir="1" title="Siguiente"><i data-lucide="chevron-right" size="20"></i></button>
          </div>
        </div>`;
      }).join("")}
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

        <!-- Botón Desplegable de Datos Bancarios / Pago Móvil -->
        <div class="perf-cart-bank-section">
          <button type="button" class="perf-cart-bank-toggle" data-action="toggle-cart-bank">
            <span><i data-lucide="credit-card" size="15"></i> Ver datos bancarios para pagar</span>
            <i data-lucide="${state.cartBankOpen ? "chevron-up" : "chevron-down"}" size="15"></i>
          </button>

          ${state.cartBankOpen ? `
            <div class="perf-cart-bank-details">
              ${(state.config.bancoNombre || state.config.bancoTelefono || state.config.bancoCedula || state.config.bancoCuenta) ? `
                ${state.config.bancoNombre ? `
                  <div class="perf-bank-field-row">
                    <div class="perf-bank-field-info">
                      <span class="lbl">Banco</span>
                      <strong class="val">${esc(state.config.bancoNombre)}</strong>
                    </div>
                    <button type="button" class="perf-copy-btn" data-action="copy-text" data-val="${esc(state.config.bancoNombre)}" title="Copiar banco">
                      <i data-lucide="copy" size="13"></i> Copiar
                    </button>
                  </div>
                ` : ""}

                ${state.config.bancoTelefono ? `
                  <div class="perf-bank-field-row">
                    <div class="perf-bank-field-info">
                      <span class="lbl">Teléfono (Pago Móvil)</span>
                      <strong class="val">${esc(state.config.bancoTelefono)}</strong>
                    </div>
                    <button type="button" class="perf-copy-btn" data-action="copy-text" data-val="${esc(state.config.bancoTelefono)}" title="Copiar teléfono">
                      <i data-lucide="copy" size="13"></i> Copiar
                    </button>
                  </div>
                ` : ""}

                ${state.config.bancoCedula ? `
                  <div class="perf-bank-field-row">
                    <div class="perf-bank-field-info">
                      <span class="lbl">Cédula / RIF</span>
                      <strong class="val">${esc(state.config.bancoCedula)}</strong>
                    </div>
                    <button type="button" class="perf-copy-btn" data-action="copy-text" data-val="${esc(state.config.bancoCedula)}" title="Copiar cédula">
                      <i data-lucide="copy" size="13"></i> Copiar
                    </button>
                  </div>
                ` : ""}

                ${state.config.bancoCuenta ? `
                  <div class="perf-bank-field-row">
                    <div class="perf-bank-field-info">
                      <span class="lbl">Número de Cuenta</span>
                      <strong class="val" style="font-size:12px">${esc(state.config.bancoCuenta)}</strong>
                    </div>
                    <button type="button" class="perf-copy-btn" data-action="copy-text" data-val="${esc(state.config.bancoCuenta)}" title="Copiar cuenta">
                      <i data-lucide="copy" size="13"></i> Copiar
                    </button>
                  </div>
                ` : ""}
              ` : `
                <div style="font-size:12.5px;color:rgba(248,250,252,0.65);padding:6px 4px;text-align:center">
                  ${state.config.banco ? esc(state.config.banco) : "Configura los datos bancarios en el Panel Admin > Datos & Banco para que aparezcan aquí con botones de copiar."}
                </div>
              `}
            </div>
          ` : ""}
        <!-- Botón para Subir Captura de Pago -->
        <div class="perf-cart-receipt-section">
          ${state.paymentReceipt ? `
            <div class="perf-receipt-preview-box">
              <img src="${state.paymentReceipt.dataUrl}" alt="Comprobante de pago" class="perf-receipt-thumb" data-action="view-receipt" data-src="${state.paymentReceipt.dataUrl}" title="Toca para ampliar" />
              <div class="perf-receipt-info">
                <div class="perf-receipt-title"><i data-lucide="check-circle-2" size="14" style="color:var(--ok)"></i> Captura adjuntada</div>
                <div class="perf-receipt-sub">Comprobante listo para enviar con tu orden</div>
              </div>
              <button type="button" class="perf-iconbtn danger xs" data-action="remove-receipt" title="Cambiar comprobante">
                <i data-lucide="trash-2" size="14"></i>
              </button>
            </div>
          ` : `
            <label class="perf-upload-receipt-btn" for="cart-receipt-input">
              <i data-lucide="upload-cloud" size="16"></i> Subir captura de pago
            </label>
            <input type="file" id="cart-receipt-input" class="perf-hidden-file" accept="image/*" data-action="upload-payment-receipt" />
          `}
        </div>

        <a class="perf-btn gold full" style="margin-top:12px;text-decoration:none" href="${buildWhatsAppUrl()}" target="_blank" rel="noopener noreferrer" data-action="send-whatsapp">
          <i data-lucide="send" size="16"></i> Enviar pedido por WhatsApp
        </a>
      </div>
    </div>
  </div>`;
}

function tpl_outofstock_modal() {
  const m = state.outOfStockModal;
  if (!m) return "";

  return `
  <div class="perf-modal-backdrop" data-action="close-outofstock-modal">
    <div class="perf-modal-box" onclick="event.stopPropagation()">
      <div class="perf-modal-icon-wrap">
        <i data-lucide="package-x" size="36"></i>
      </div>
      <div class="perf-modal-title">¡Perfume Agotado!</div>
      <div class="perf-modal-body">
        Disculpa, la fragancia <strong style="color:var(--gold-soft)">"${esc(m.productName)}"</strong> se encuentra temporalmente agotada o no cuenta con suficiente stock en mililitros para la opción seleccionada (${m.presLabel}).
        ${m.remainingMl > 0 ? `<div style="margin-top:8px;font-size:12px;opacity:0.8">Actualmente quedan solo <strong>${m.remainingMl}ml</strong> disponibles de esta esencia.</div>` : ""}
      </div>
      <div class="perf-modal-actions">
        <button class="perf-btn gold full" data-action="close-outofstock-modal">
          Entendido, ver otras fragancias
        </button>
      </div>
    </div>
  </div>`;
}

function tpl_notification_banner() {
  const nb = state.notificationBanner;
  if (!nb) return "";

  return `
  <div class="perf-top-banner-wrapper">
    <div class="perf-top-banner">
      <div class="perf-top-banner-icon">
        <i data-lucide="bell-ring" size="20"></i>
      </div>
      <div class="perf-top-banner-content">
        <div class="perf-top-banner-title">${esc(nb.title)}</div>
        <div class="perf-top-banner-desc">${esc(nb.message)}</div>
      </div>
      <button class="perf-top-banner-close" data-action="close-notification-banner" title="Cerrar">
        <i data-lucide="x" size="16"></i>
      </button>
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
    ${tpl_notification_banner()}
    ${tpl_toast()}
    ${tpl_outofstock_modal()}
    ${tpl_receipt_modal()}
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
        syncLiveRates(false);
        break;
      case "set-adminsub":
        state.adminSub = trigger.dataset.sub;
        if (state.adminSub === "pedidos" && state.adminOrders.length === 0) {
          fetchAdminOrders();
        } else {
          render();
        }
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
      case "select-refill-ml":
        setSelRefillMl(trigger.dataset.id, trigger.dataset.ml);
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
      case "scroll-carousel": {
        const targetId = trigger.dataset.target;
        const dir = Number(trigger.dataset.dir) || 1;
        const track = document.getElementById(targetId);
        if (track) {
          track.scrollBy({ left: dir * 360, behavior: "smooth" });
        }
        break;
      }
      case "submit-newpres":
        addCustomPresentation();
        break;
      case "remove-pres":
        removeCustomPresentation(trigger.dataset.key);
        break;
      case "toggle-cart-bank":
        state.cartBankOpen = !state.cartBankOpen;
        render();
        break;
      case "copy-text": {
        const textToCopy = trigger.dataset.val || "";
        if (textToCopy) {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textToCopy).then(() => {
              showToast(`Copiado: ${textToCopy}`);
            }).catch(() => {
              showToast(`Copiado: ${textToCopy}`);
            });
          } else {
            // Fallback manual
            const ta = document.createElement("textarea");
            ta.value = textToCopy;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            showToast(`Copiado: ${textToCopy}`);
          }
        }
        break;
      }
      case "refresh-orders":
        fetchAdminOrders();
        break;
      case "view-receipt":
        state.viewReceiptModal = trigger.dataset.src;
        render();
        break;
      case "close-receipt-modal":
        state.viewReceiptModal = null;
        render();
        break;
      case "remove-receipt":
        removePaymentReceipt();
        break;
      case "close-notification-banner":
        state.notificationBanner = null;
        render();
        break;
      case "close-outofstock-modal":
        state.outOfStockModal = null;
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
    } else if (action === "input-newpres") {
      state.newPres[el.dataset.field] = el.value;
    } else if (action === "input-newprod") {
      state.newProd[el.dataset.field] = el.value;
    } else if (action === "input-editprod" && state.editingProd) {
      state.editingProd[el.dataset.field] = el.value;
    } else if (action === "input-refill-price") {
      const ml = el.dataset.ml;
      updatePrecioField(`refill_${ml}`, el.value);
      if (ml === "30") {
        updatePrecioField("refill", el.value);
      }
    } else if (action === "input-refill-ml") {
      setSelRefillMl(el.dataset.id, el.value);
    }
  });

  app.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.action === "upload-image") handleImageFile(el.files && el.files[0]);
    if (el.dataset.action === "upload-edit-image") handleEditImageFile(el.files && el.files[0]);
    if (el.dataset.action === "upload-payment-receipt") handlePaymentReceiptFile(el.files && el.files[0]);
    if (el.dataset.action === "change-order-status") {
      updateOrderStatus(el.dataset.id, el.value);
    }
    if (el.dataset.action === "change-admin-refill-ml") {
      state.adminRefillMl = el.value;
      render();
    }
    if (el.dataset.action === "change-refill-select") {
      setSelRefillMl(el.dataset.id, el.value);
    }
    if (el.dataset.action === "input-newprod") {
      state.newProd[el.dataset.field] = el.value;
    }
    if (el.dataset.action === "input-editprod" && state.editingProd) {
      state.editingProd[el.dataset.field] = el.value;
    }
  });
});
