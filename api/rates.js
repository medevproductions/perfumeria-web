export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  let bcv = "798.33";
  let binance = "937.50";
  let cop = "3210.38";

  // 1. Obtener BCV en vivo
  try {
    const resBcv = await fetch("https://ve.dolarapi.com/v1/dolares/oficial", { cache: "no-store" });
    if (resBcv.ok) {
      const data = await resBcv.json();
      if (data && data.promedio) {
        bcv = String(Number(data.promedio).toFixed(2));
      }
    }
  } catch (e) {
    console.error("Error fetching BCV:", e);
  }

  // 2. Obtener Binance P2P en vivo directamente desde el endpoint público de Binance P2P
  try {
    const binancePayload = {
      asset: "USDT",
      fiat: "VES",
      merchantCheck: false,
      page: 1,
      payTypes: ["Banesco", "PagoMovil", "Mercantil", "Provincial", "BNC"],
      publisherType: null,
      rows: 10,
      tradeType: "BUY",
    };

    const resBinance = await fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: JSON.stringify(binancePayload),
      cache: "no-store",
    });

    if (resBinance.ok) {
      const bData = await resBinance.json();
      if (bData && bData.data && Array.isArray(bData.data) && bData.data.length > 0) {
        const prices = bData.data
          .map((item) => parseFloat(item.adv && item.adv.price))
          .filter((p) => !isNaN(p) && p > 0)
          .slice(0, 5);

        if (prices.length > 0) {
          const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
          binance = String(avg.toFixed(2));
        }
      }
    }
  } catch (e) {
    console.error("Error fetching Binance P2P directly:", e);
    // Fallback a DolarApi paralelo
    try {
      const resParalelo = await fetch("https://ve.dolarapi.com/v1/dolares/paralelo", { cache: "no-store" });
      if (resParalelo.ok) {
        const pData = await resParalelo.json();
        if (pData && pData.promedio) {
          binance = String(Number(pData.promedio).toFixed(2));
        }
      }
    } catch (e2) {}
  }

  // 3. Obtener COP en vivo (Google Finance / ExchangeRate)
  try {
    const resCop = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
    if (resCop.ok) {
      const cData = await resCop.json();
      if (cData && cData.rates && cData.rates.COP) {
        cop = String(Number(cData.rates.COP).toFixed(2));
      }
    }
  } catch (e) {
    console.error("Error fetching COP:", e);
  }

  return res.status(200).json({
    success: true,
    bcv,
    binance,
    cop,
    timestamp: Math.floor(Date.now() / 1000),
  });
}
