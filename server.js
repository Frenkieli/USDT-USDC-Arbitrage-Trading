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
const logFilePath = path.join(__dirname, "account_total_log.md");

axios.defaults.headers.common["X-MEXC-APIKEY"] = apiKey;
axios.defaults.headers.common["Content-Type"] = "application/json";
axios.defaults.headers.common["Access-Control-Allow-Origin"] = "*";
axios.defaults.headers.common["Access-Control-Allow-Methods"] =
  "GET, PUT, POST, DELETE, OPTIONS";
axios.defaults.headers.common["Access-Control-Allow-Headers"] =
  "Content-Type, Authorization, Content-Length, X-Requested-With";

// Here you need to write the encryption function for axios before sending, which has two parameters: params and data, but both are passed in params.
function getSignature(params) {
  const totalParams = Object.keys(params)
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return CryptoJS.HmacSHA256(totalParams, secretKey).toString();
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
      signature: getSignature(params),
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

// axios
//   .delete(
//     `${BASE_URL}/api/v3/userDataStream?listenKey=1b32ba2916834b9e851f5069c8e5b2aaaf1c0f267d8667edd47b126f8f8144de`
//   )
//   .then((response) => {
//     console.log("Delete ListenKey:", response.data);
//   })
//   .catch((error) => console.error("Error:", error));

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

// 解析 JSON 請求數據
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

      const usdtBalance = balances.find((balance) => balance.asset === "USDT");
      const usdcBalance = balances.find((balance) => balance.asset === "USDC");

      let usdtTotal =
        parseFloat(usdtBalance.free) + parseFloat(usdtBalance.locked);
      let usdcTotal =
        parseFloat(usdcBalance.free) + parseFloat(usdcBalance.locked);
      let total = usdtTotal + usdcTotal;

      console.log(`Account Total : ${total} - ${new Date().toLocaleString()}`);

      res.send(response.data);
    })
    .catch((error) => console.error("Error:", error));
});

app.get("/api/order", async (req, res) => {
  axios
    .get(`${BASE_URL}/api/v3/openOrders?symbol=${req.query.symbol}`)
    .then((response) => {
      res.send(response.data);
    })
    .catch((error) => console.error("Error:", error));
});

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
  let toBreak = false;
  let lessOneTotal = 0;

  try {
    for (let i = 0; i < toOrderList.length; i++) {
      if (toBreak) {
        break;
      }
      const { symbol, side, type, quantity, price } = toOrderList[i];
      if (quantity * price >= 1) {
        console.log(
          `Place order: ${toOrderList[i].side} - ${toOrderList[i].price} - ${toOrderList[i].quantity}`
        );

        await axios
          .post(`${BASE_URL}/api/v3/order`, {
            symbol,
            side,
            type,
            quantity,
            price,
          })
          .then((response) => {
            console.log(
              `Place Order Done: ${toOrderList[i].side} - ${toOrderList[i].price} - ${toOrderList[i].quantity}`
            );
          })
          .catch((error) => {
            console.error(
              `Place Order Error: ${toOrderList[i].side} - ${toOrderList[i].price} - ${toOrderList[i].quantity}:`,
              error
            );
            if (
              error?.response?.data?.code === 30005 ||
              error?.response?.data?.code === 30004
            ) {
              toBreak = true;
              // axios.delete(`${BASE_URL}/api/v3/openOrders?symbol=${symbol}`);
            }
          });
      } else {
        lessOneTotal += quantity * price;
      }
    }
  } catch (error) {
    console.error(`Error 2:`, error);
  }

  if (toBreak) {
    console.error(`response error client: ${new Date().toLocaleString()}`);

    res.send("error");
  } else {
    console.log(
      `response success client: ${lessOneTotal} - ${new Date().toLocaleString()}`
    );

    res.send("success");
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
  const { assetBalances, total, timestamp } = data;

  // 按資產名稱排序
  const sortedBalances = assetBalances
    .filter((balance) => balance.total > 0)
    .sort((a, b) => a.asset.localeCompare(b.asset));

  // 生成資產列表字符串
  const assetsStr = sortedBalances
    .map((balance) => `${balance.asset}:${balance.total.toFixed(4)}`)
    .join(", ");

  // 如果文件不存在，先創建表頭
  if (!fs.existsSync(logFilePath)) {
    const header = "| Date | Assets | USDT+USDC Total |\n| --- | --- | --- |\n";
    fs.writeFileSync(logFilePath, header, "utf8");
  }

  // 生成新的日誌條目（markdown 表格行）
  const logEntry = `| ${timestamp} | ${assetsStr} | ${total.toFixed(4)} |\n`;

  fs.appendFileSync(logFilePath, logEntry, "utf8");
  console.log(`Successfully saved to log file: ${logEntry}`);
}

// 新增共用方法
async function fetchAndLogAccountBalance() {
  try {
    const response = await axios.get(`${BASE_URL}/api/v3/account`);
    const { balances } = response.data;

    // 計算所有資產餘額
    let assetBalances = balances.map((balance) => {
      const total = parseFloat(balance.free) + parseFloat(balance.locked);
      return {
        asset: balance.asset,
        free: parseFloat(balance.free),
        locked: parseFloat(balance.locked),
        total,
      };
    });

    // 打印所有資產餘額
    console.log("=== Asset Balances ===");
    assetBalances = assetBalances.filter((balance) => balance.total > 0);

    // 獲取 USDT 和 USDC 的餘額用於記錄
    const usdtBalance = assetBalances.find(
      (balance) => balance.asset === "USDT"
    );
    const usdcBalance = assetBalances.find(
      (balance) => balance.asset === "USDC"
    );

    const data = {
      total: (usdtBalance?.total || 0) + (usdcBalance?.total || 0),
      assetBalances,
      timestamp: new Date().toUTCString(),
    };

    appendToFile(data);
  } catch (error) {
    console.error("Error fetching account total:", error);
  }
}

// 修改定時任務
cron.schedule("0 8 * * *", fetchAndLogAccountBalance);

// 修改初始執行
(async () => {
  await fetchAndLogAccountBalance();
})();
