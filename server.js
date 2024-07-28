const express = require("express");
const path = require("path");
const axios = require("axios");
var CryptoJS = require("crypto-js");
// const puppeteer = require("puppeteer");
const BASE_URL = "https://api.mexc.com";
const apiKey = "mx0vglZrFklAELZLNi";
const secretKey = "babbfef6039343e790cfa6151ff739c2";

axios.defaults.headers.common["X-MEXC-APIKEY"] = apiKey;
axios.defaults.headers.common["Content-Type"] = "application/json";
axios.defaults.headers.common["Access-Control-Allow-Origin"] = "*";
axios.defaults.headers.common["Access-Control-Allow-Methods"] =
  "GET, PUT, POST, DELETE, OPTIONS";
axios.defaults.headers.common["Access-Control-Allow-Headers"] =
  "Content-Type, Authorization, Content-Length, X-Requested-With";

// 這邊要撰寫轉化為signature的加密function
function getSignature(params) {
  const totalParams = Object.keys(params)
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return CryptoJS.HmacSHA256(totalParams, secretKey).toString();
}

// 這邊要撰寫 axios 送出前的加密function，他有 params 跟 data 兩種參數，但統一在 params 帶入
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
        console.log("Get ListenKey:", response.data.listenKey);
        return response.data.listenKey;
      } else {
        return axios
          .post(`${BASE_URL}/api/v3/userDataStream`)
          .then((response) => {
            console.log("generate ListenKey", response.data.listenKey);
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
      console.log("Keep ListenKey:", response.data);
    })
    .catch((error) => console.error("Error:", error));

  // 延長 listenKey 有效時間
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

app.post("/api/v3/order", async (req, res) => {
  const toOrderList = req.body;
  try {
    toOrderList.forEach((order) => {
      const { symbol, side, type, quantity, price } = order;

      if (quantity * price >= 1) {
        console.log(
          `Place order: ${order.side} - ${order.price} - ${order.quantity}`
        );

        axios
          .post(`${BASE_URL}/api/v3/order`, {
            symbol,
            side,
            type,
            quantity,
            price,
          })
          .then((response) => {
            res.send(response.data);
          })
          .catch((error) => console.error("Error:", error));
      }
    });
  } catch (error) {
    res.send("Error:");
  }
});

// app.post("/test", (req, res) => {
//   console.log(req.body);
//   res.send("POST request to the homepage");
// });

// (async () => {
//   // launches a browser instance
//   const browser = await puppeteer.launch();
//   // creates a new page in the default browser context
//   const page = await browser.newPage();
//   // navigates to the page to be scraped
//   await page.goto("http://localhost:3010/");
// })();
