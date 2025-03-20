require("dotenv").config();
const cron = require("node-cron");
const fs = require("fs");
const express = require("express");
const path = require("path");
const axios = require("axios");
var CryptoJS = require("crypto-js");
const puppeteer = require("puppeteer");
const BASE_URL = "https://api.mexc.com";
const apiKey = process.env.API_KEY;
const secretKey = process.env.SECRET_KEY;
const logFilePath = path.join(__dirname, "account_total_log.csv");

axios.defaults.headers.common["X-MEXC-APIKEY"] = apiKey;
axios.defaults.headers.common["Content-Type"] = "application/json";
axios.defaults.headers.common["Access-Control-Allow-Origin"] = "*";
axios.defaults.headers.common["Access-Control-Allow-Methods"] =
  "GET, PUT, POST, DELETE, OPTIONS";
axios.defaults.headers.common["Access-Control-Allow-Headers"] =
  "Content-Type, Authorization, Content-Length, X-Requested-With";

function getUrlSignature(params) {
  const totalParams = Object.keys(params)
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return CryptoJS.HmacSHA256(totalParams, secretKey).toString();
}

function getSignature(params) {
  const convertedParams = {};
  for (const [key, value] of Object.entries(params)) {
    convertedParams[key] = String(value);
  }

  const orderedParams = Object.keys(convertedParams)
    .sort()
    .reduce((obj, key) => {
      obj[key] = convertedParams[key];
      return obj;
    }, {});

  const queryString = Object.entries(orderedParams)
    .map(([key, value]) => {
      const encodedValue = encodeURIComponent(value)
        .replace(/%20/g, "+")
        .replace(/%2C/g, "%2C")
        .replace(/%3A/g, "%3A")
        .replace(/%2F/g, "%2F");
      return `${key}=${encodedValue}`;
    })
    .join("&");

  return CryptoJS.HmacSHA256(queryString, secretKey).toString().toLowerCase();
}

// Here you need to write the encryption function for axios before sending, which has two parameters: params and data, but both are passed in params.
axios.interceptors.request.use(function (config) {
  const timestamp = Date.now();
  if (config.method === "get" || config.method === "delete") {
    const [url, paramsString] = config.url.split("?");
    config.url = url;

    let params = {
      ...(paramsString
        ? Object.fromEntries(new URLSearchParams(paramsString))
        : {}),
      timestamp,
    };

    params = {
      ...params,
      signature: getUrlSignature(params),
    };

    config.url = `${config.url}?${new URLSearchParams(params).toString()}`;
  } else {
    config.data = {
      ...config.data,
      timestamp,
    };

    config.data = {
      ...config.data,
      signature: getSignature(config.data),
    };
    config.url = `${config.url}?${new URLSearchParams(config.data).toString()}`;
  }

  return config;
});

function generateListenKey() {
  return axios
    .get(`${BASE_URL}/api/v3/userDataStream`)
    .then((response) => {
      if (response.data.listenKey.length > 0) {
        // console.log("Get ListenKey:", response.data.listenKey);
        return response.data.listenKey;
      } else {
        return axios
          .post(`${BASE_URL}/api/v3/userDataStream`)
          .then((response) => {
            // console.log("generate ListenKey", response.data.listenKey);
            return response.data.listenKey;
          })
          .catch((error) => console.error("Error:", error));
      }
    })
    .catch((error) => console.error("Error:", error));
}

// Create a new express application
const app = express();
const port = 3010;

// Parse JSON request data
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

let getListenKeyTimer = null;

// API

app.get("/api/getListenKey", async (req, res) => {
  const originListenKey = await generateListenKey();
  const listenKey =
    typeof originListenKey === "string"
      ? originListenKey
      : originListenKey?.[0];

  axios
    .put(`${BASE_URL}/api/v3/userDataStream`, {
      listenKey,
    })
    .then((response) => {
      // console.log("Keep ListenKey:", response.data);
      console.log("====================================");
    })
    .catch((error) => console.error("Error:", error));

  // Extend the validity period of the listenKey
  clearInterval(getListenKeyTimer);
  getListenKeyTimer = setInterval(() => {
    axios
      .put(`${BASE_URL}/api/v3/userDataStream`, {
        listenKey,
      })
      .then((response) => {
        console.log("Keep ListenKey:", response.data);
      })
      .catch((error) => console.error("Error:", error));
  }, 1000 * 60 * 30);
  res.send({ listenKey });
});

app.get("/api/getAccount", async (req, res) => {
  axios
    .get(`${BASE_URL}/api/v3/account`)
    .then((response) => {
      const { balances } = response.data;

      const nonZeroBalances = balances.filter((balance) => {
        const total = parseFloat(balance.free) + parseFloat(balance.locked);
        return total > 0;
      });

      let output = "\nAccount Balance:";
      nonZeroBalances.forEach((balance) => {
        const total = parseFloat(balance.free) + parseFloat(balance.locked);
        output += `\n${balance.asset}: ${total.toFixed(8)}`;
      });
      output += `\nTime: ${new Date().toLocaleString()}\n`;

      console.log(output);
      res.send(response.data);
    })
    .catch((error) => console.error("Error:", error));
});

// 添加緩存對象
const tradeFeeCache = {
  data: new Map(),
  pending: new Map(), // 新增：存儲進行中的請求
  timeout: 1000,
};

async function checkTradeFee(symbol) {
  try {
    const cachedData = tradeFeeCache.data.get(symbol);
    const now = Date.now();

    if (cachedData && now - cachedData.timestamp < tradeFeeCache.timeout) {
      return cachedData.fees;
    }

    const pendingRequest = tradeFeeCache.pending.get(symbol);
    if (pendingRequest) {
      return pendingRequest;
    }

    const requestPromise = (async () => {
      try {
        const response = await axios.get(
          `${BASE_URL}/api/v3/tradeFee?symbol=${symbol}`
        );
        const { makerCommission, takerCommission } = response.data.data;

        if (makerCommission > 0 || takerCommission > 0) {
          console.error(`
            ========== WARNING: Trading Fee Detected! Stopping Trading! ==========
            Trading Pair: ${symbol}
            Maker Fee: ${makerCommission}
            Taker Fee: ${takerCommission}
            Time: ${new Date().toLocaleString()}
            Shutting down server to prevent losses...
            ==========================================
          `);

          process.exit(1);
        }

        const fees = { makerCommission, takerCommission };

        // 更新緩存
        tradeFeeCache.data.set(symbol, {
          fees,
          timestamp: now,
        });

        return fees;
      } finally {
        // 請求完成後，清除 pending 狀態
        tradeFeeCache.pending.delete(symbol);
      }
    })();

    // 存儲進行中的請求
    tradeFeeCache.pending.set(symbol, requestPromise);

    return requestPromise;
  } catch (error) {
    console.error(
      "========== WARNING: Error checking trading fees. Stopping trading to prevent losses!",
      error
    );
    process.exit(1);
  }
}

const orderDebounceCache = {
  requests: new Map(),
  timeout: 1000, // 1 second debounce timeout
};

app.get("/api/order", async (req, res) => {
  try {
    const symbol = req.query.symbol;
    const now = Date.now();

    const lastRequest = orderDebounceCache.requests.get(symbol);
    if (
      lastRequest &&
      now - lastRequest.timestamp < orderDebounceCache.timeout
    ) {
      return res.send(lastRequest.data);
    }

    await checkTradeFee(req.query.symbol);
    const response = await axios.get(
      `${BASE_URL}/api/v3/openOrders?symbol=${symbol}`
    );

    // 在背景執行小額資產兌換，不等待結果
    convertSmallAssets().catch((err) =>
      console.error("Small assets conversion error:", err)
    );

    orderDebounceCache.requests.set(symbol, {
      timestamp: now,
      data: response.data,
    });

    res.send(response.data);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send({ error: "Internal Server Error" });
  }
});

async function convertSmallAssets() {
  const convertList = await axios.get(
    `${BASE_URL}/api/v3/capital/convert/list`
  );

  const assetsToConvert = convertList.data
    .filter(
      (item) => !item.code && item.asset !== "USDT" && item.asset !== "USDC"
    )
    .map((item) => item.asset);

  if (assetsToConvert.length > 0) {
    let convertResult = await axios.post(`${BASE_URL}/api/v3/capital/convert`, {
      asset: assetsToConvert,
    });
    console.log(convertResult.data);
  }
}

app.post("/api/v3/cancel", async (req, res) => {
  const toCancelOrderList = req.body;
  let toBreak = false;
  let keysList = {};
  try {
    for (let i = 0; i < toCancelOrderList.length; i++) {
      if (toBreak) {
        break;
      }

      const { orderId, symbol, price } = toCancelOrderList[i];

      keysList[price] = keysList[price] ? price + keysList[price] : price;

      await axios
        .delete(`${BASE_URL}/api/v3/order?symbol=${symbol}&orderId=${orderId}`)
        .then((response) => {
          console.warn(`Cancel Order Done: ${price} - ${orderId}`);
        })
        .catch((error) => {
          console.error(`Cancel Order Error: ${orderId}:`, error);
          toBreak = true;
        });
    }
  } catch (error) {
    console.error(`Error 1:`, error);
  }

  if (toBreak) {
    console.error(
      `Cancel Order error client: ${Object.entries(keysList)
        .map((value) => `${value[0]} - ${value[1]}`)
        .join(", ")} - ${new Date().toLocaleString()}`
    );
    res.send("error");
  } else {
    console.warn(
      `Cancel Order success client: ${Object.keys(keysList).join(
        ", "
      )} - ${new Date().toLocaleString()}`
    );
    res.send("success");
  }
});

app.post("/api/v3/order", async (req, res) => {
  const toOrderList = req.body;
  let lessOneTotal = 0;

  try {
    // Filter out orders with value >= 1 and format them for batch order
    const validOrders = toOrderList
      .filter((order) => order.quantity * order.price >= 1)
      .map((order, index) => ({
        type: order.type,
        symbol: order.symbol,
        side: order.side,
        price: order.price.toString(),
        quantity: order.quantity.toString(),
        newClientOrderId: Date.now() + index,
      }));

    // Calculate total for orders with value < 1
    lessOneTotal = toOrderList
      .filter((order) => order.quantity * order.price < 1)
      .reduce((sum, order) => sum + order.quantity * order.price, 0);

    if (validOrders.length > 0) {
      const batchSize = 30;
      for (let i = 0; i < validOrders.length; i += batchSize) {
        const batch = validOrders.slice(i, i + batchSize);

        const result = await axios.post(`${BASE_URL}/api/v3/batchOrders`, {
          batchOrders: JSON.stringify(batch),
        });

        if (result.data && Array.isArray(result.data)) {
          const errors = result.data.filter((item) => item.code === 500);
          if (errors.length > 0) {
            console.error("Batch order errors:", {
              timestamp: new Date().toLocaleString(),
              totalOrders: batch.length,
              failedOrders: errors.length,
              errors: errors,
              requestData: batch,
              responseData: result.data,
            });
          }
        }
      }
    }

    console.log(
      `response success client: ${lessOneTotal} - ${new Date().toLocaleString()}`
    );
    res.send("success");
  } catch (error) {
    // 增強錯誤日誌
    console.error("Error processing orders:", {
      timestamp: new Date().toLocaleString(),
      message: error.message,
      response: error.response?.data,
      requestData: error.config?.data,
      stack: error.stack,
    });
    res.send("error");
  }
});

// app.post("/test", (req, res) => {
//   console.log(req.body);
//   res.send("POST request to the homepage");
// });

async function startBrowser() {
  // launches a browser instance
  const browser = await puppeteer.launch();
  // creates a new page in the default browser context
  const page = await browser.newPage();
  // navigates to the page to be scraped
  await page.goto("http://localhost:3010/");

  setTimeout(async () => {
    await browser.close();

    startBrowser();
  }, 1000 * 60 * 5);
}

startBrowser();

// Function to append data to a local file
function appendToFile(data) {
  const { assetBalances, totalPrice, timestamp } = data;

  // Sort by asset name
  const sortedBalances = assetBalances
    .filter((balance) => balance.total > 0)
    .sort((a, b) => a.asset.localeCompare(b.asset));

  // Generate asset list string
  const assetsStr = sortedBalances
    .map((balance) => `${balance.asset}:${balance.total.toFixed(4)}`)
    .join(";");

  // If file doesn't exist, create header first
  if (!fs.existsSync(logFilePath)) {
    const header = "Date,Assets,USDT Value\n";
    fs.writeFileSync(logFilePath, header, "utf8");
  }

  // Generate new log entry (CSV row)
  const logEntry = `${timestamp},${assetsStr},${totalPrice.toFixed(4)}\n`;

  fs.appendFileSync(logFilePath, logEntry, "utf8");
  console.log(`Successfully saved to CSV file: ${logEntry}`);
}

// Add shared method
async function fetchAndLogAccountBalance() {
  try {
    const response = await axios.get(`${BASE_URL}/api/v3/account`);
    const { balances } = response.data;

    // Calculate all asset balances
    let assetBalances = await Promise.all(
      balances.map(async (balance) => {
        const total = parseFloat(balance.free) + parseFloat(balance.locked);

        if (total === 0) {
          return null;
        }

        let totalPrice = balance.asset === "USDT" ? total : 0;

        if (balance.asset !== "USDT") {
          try {
            const response = await axios.get(
              `${BASE_URL}/api/v3/ticker/price?symbol=${balance.asset}USDT`
            );

            totalPrice = total * response.data.price;
          } catch (error) {
            console.log(
              "\x1b[31m%s\x1b[0m",
              `Asset Ticker not found: ${balance.asset}USDT`
            );
          }
        }

        return {
          asset: balance.asset,
          free: parseFloat(balance.free),
          locked: parseFloat(balance.locked),
          total,
          totalPrice,
        };
      })
    );

    // Print all asset balances
    console.log("=== Asset Balances ===");
    assetBalances = assetBalances.filter(Boolean);

    const totalPrice = assetBalances.reduce(
      (sum, balance) => sum + balance.totalPrice,
      0
    );

    const data = {
      totalPrice,
      assetBalances,
      timestamp: new Date().toLocaleString().replace(/[,]/g, ""),
    };

    appendToFile(data);
  } catch (error) {
    console.error("Error fetching account total:", error);
  }
}

// Modify scheduled task
cron.schedule("0 8 * * *", fetchAndLogAccountBalance);

// Modify initial execution
(async () => {
  await fetchAndLogAccountBalance();
})();
