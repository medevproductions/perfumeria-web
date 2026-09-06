import https from "https";

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  let bcv = null;
  let binance = null;
  let cop = null;

  // 1. Obtener BCV Oficial directamente desde el portal oficial bcv.org.ve (ignorando certificados desactualizados de entes estatales)
  try {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const bcvData = await new Promise((resolve) => {
      https.get("https://www.bcv.org.ve/", {
        agent,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        timeout: 6000
      }, (resp) => {
        let data = "";
        resp.on("data", (chunk) => data += chunk);
        resp.on("end", () => {
          const m = data.match(/id=["']dolar["'][\s\S]*?<strong[^>]*>\s*([0-9.,]+)/i);
          if (m) {
            const clean = m[1].replace(/\./g, "").replace(",", ".");
            resolve(parseFloat(clean).toFixed(2));
          } else {
            resolve(null);
          }
        });
      }).on("error", () => resolve(null));
    });

    if (bcvData && Number(bcvData) > 100) {
      bcv = bcvData;
    }
  } catch (e) {
    console.error("Error scraping bcv.org.ve:", e);
  }

  // Fallback 1 para BCV si el portal estatal está caído: open.er-api.com (actualizado a diario)
  if (!bcv) {
    try {
      const resEr = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
      if (resEr.ok) {
        const erData = await resEr.json();
        if (erData && erData.rates && erData.rates.VES && Number(erData.rates.VES) > 100) {
          bcv = String(Number(erData.rates.VES).toFixed(2));
        }
      }
    } catch (eEr) {}
  }

  // Fallback 2 para BCV: DolarApi oficial
  if (!bcv) {
    try {
      const resBcv = await fetch("https://ve.dolarapi.com/v1/dolares/oficial", { cache: "no-store" });
      if (resBcv.ok) {
        const data = await resBcv.json();
        if (data && data.promedio) {
          bcv = String(Number(data.promedio).toFixed(2));
        }
      }
    } catch (e) {}
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
  }

  // Fallback 1 para Binance P2P: CriptoYa (Binance P2P VES)
  if (!binance) {
    try {
      const resCripto = await fetch("https://criptoya.com/api/binancep2p/usdt/ves", {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store"
      });
      if (resCripto.ok) {
        const cData = await resCripto.json();
        const p = cData.bid || cData.ask;
        if (p && Number(p) > 100) {
          binance = String(Number(p).toFixed(2));
        }
      }
    } catch (eCripto) {}
  }

  // Fallback 2 a DolarApi paralelo para Binance si falla
  if (!binance) {
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

  // 3. Obtener COP (Pesos Colombianos) en vivo directamente desde Binance P2P (Bancolombia / Nequi)
  // Filtrando anuncios atípicos o con precios inflados/exagerados
  try {
    const copPayload = {
      asset: "USDT",
      fiat: "COP",
      merchantCheck: false,
      page: 1,
      payTypes: ["Bancolombia", "Nequi"],
      publisherType: null,
      rows: 20,
      tradeType: "BUY",
    };

    const resBinanceCop = await fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: JSON.stringify(copPayload),
      cache: "no-store",
    });

    if (resBinanceCop.ok) {
      const cData = await resBinanceCop.json();
      if (cData && cData.data && Array.isArray(cData.data) && cData.data.length > 0) {
        let prices = cData.data
          .map((item) => parseFloat(item.adv && item.adv.price))
          .filter((p) => !isNaN(p) && p > 1000)
          .sort((a, b) => a - b);

        if (prices.length > 0) {
          // Filtrado anti-outliers: descartar extremos (anuncios inflados o muy por encima de la media)
          let validPrices = prices;
          if (prices.length >= 6) {
            const start = Math.floor(prices.length * 0.15);
            const end = Math.ceil(prices.length * 0.85);
            validPrices = prices.slice(start, end);
          }
          const avg = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
          cop = String(avg.toFixed(2));
        }
      }
    }
  } catch (eCopBin) {
    console.error("Error fetching Binance COP P2P:", eCopBin);
  }

  // Fallback 1 para COP: CriptoYa Binance P2P COP
  if (!cop) {
    try {
      const resCriptoCop = await fetch("https://criptoya.com/api/binancep2p/usdt/cop", {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store"
      });
      if (resCriptoCop.ok) {
        const cData = await resCriptoCop.json();
        const p = cData.bid || cData.ask;
        if (p && Number(p) > 1000) {
          cop = String(Number(p).toFixed(2));
        }
      }
    } catch (eCriptoCop) {}
  }

  // Fallback 2 para COP: Yahoo Finance
  if (!cop) {
    try {
      const resYahoo = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/COP=X", { cache: "no-store" });
      if (resYahoo.ok) {
        const yData = await resYahoo.json();
        const price = yData?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price && Number(price) > 1000) {
          cop = String(Number(price).toFixed(2));
        }
      }
    } catch (e) {}
  }

  // Fallback 3 para COP: Google Finance
  if (!cop) {
    try {
      const resGoogle = await fetch("https://www.google.com/search?q=1+USD+to+COP&hl=es", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },
        cache: "no-store"
      });
      const htmlGoogle = await resGoogle.text();
      const m = htmlGoogle.match(/data-exchange-rate="([0-9.]+)"/i) || htmlGoogle.match(/data-value="([0-9.]+)"/i);
      if (m && Number(m[1]) > 1000) {
        cop = String(Number(m[1]).toFixed(2));
      }
    } catch (e) {}
  }

  // Fallback 4 para COP: Open Exchange Rates API
  if (!cop) {
    try {
      const resCop = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
      if (resCop.ok) {
        const cData = await resCop.json();
        if (cData && cData.rates && cData.rates.COP) {
          cop = String(Number(cData.rates.COP).toFixed(2));
        }
      }
    } catch (e) {}
  }

  return res.status(200).json({
    success: true,
    bcv: bcv || "804.81",
    binance: binance || "978.04",
    cop: cop || "3152.83",
    timestamp: Math.floor(Date.now() / 1000),
  });
}
