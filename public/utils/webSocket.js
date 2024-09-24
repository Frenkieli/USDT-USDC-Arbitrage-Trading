const WEB_SOCKET_API = {
  WS: "wss://wbs.mexc.com/ws",
  SPOT_PUBLIC_LIMIT_DEPTH_V3_API: "public.limit.depth.v3.api", // Limited depth information
  SPOT_PRIVATE_ACCOUNT_V3_API: "private.account.v3.api", // Spot account information (real-time)
  SPOT_PRIVATE_DEALS_V3_API: "private.deals.v3.api", // Spot account trades (real-time)
  SPOT_PRIVATE_ORDERS_V3_API: "private.orders.v3.api", // Spot account orders (real-time)
};

const spotPrivateHandler = debounce(async () => {
  const result = await fetch("/api/getAccount").then((res) => {
    return res.json();
  });

  const orderResult = await fetch(
    `/api/order?symbol=${modelHandler.activeSpotPair}`
  ).then((res) => {
    return res.json();
  });

  modelHandler.setWalletBalances(result, orderResult);
}, 100);

class WebSocketHandler {
  constructor(listenKey) {
    if (WebSocketHandler.instance) {
      return WebSocketHandler.instance;
    }

    this.subscribeSpotPairList = [];
    this.listenKey = listenKey;

    this.connect();

    WebSocketHandler.instance = this;
  }

  static getInstance(listenKey) {
    if (!WebSocketHandler.instance) {
      WebSocketHandler.instance = new WebSocketHandler(listenKey);
    }
    return WebSocketHandler.instance;
  }

  connect() {
    this.ws = new WebSocket(`${WEB_SOCKET_API.WS}?listenKey=${this.listenKey}`);
    this.ws.onopen = this.onOpen.bind(this);
    this.ws.onmessage = this.onMessage.bind(this);
    this.ws.onclose = this.onClose.bind(this);
    this.ws.onerror = this.onError.bind(this);
  }

  onOpen() {
    console.log("WebSocket connection established.");
    if (this.subscribeSpotPairList.length != 0) {
      this.subscribeSpotPairList.forEach((symbol) => {
        this.subscribeSpotPair(symbol);
      });
    }

    this.ws.send(
      JSON.stringify({
        method: "SUBSCRIPTION",
        params: [
          `spot@${WEB_SOCKET_API.SPOT_PRIVATE_ACCOUNT_V3_API}`,
          `spot@${WEB_SOCKET_API.SPOT_PRIVATE_DEALS_V3_API}`,
          `spot@${WEB_SOCKET_API.SPOT_PRIVATE_ORDERS_V3_API}`,
        ],
      })
    );
  }

  onMessage(event) {
    const message = JSON.parse(event.data);
    const { code, msg, c: wsEventName, d: data } = message;

    if (code === 0) {
      console.log("WebSocket message:", msg, "done");
      return;
    }

    const [tradeType, eventName, pair] = wsEventName.split("@");

    switch (tradeType) {
      case "spot":
        switch (eventName) {
          case WEB_SOCKET_API.SPOT_PUBLIC_LIMIT_DEPTH_V3_API:
            const { bids: buyList, asks: sellList } = data;

            modelHandler.setSpotPairPrice({
              key: pair,
              spotPairPrice: { buyList, sellList },
            });
            break;
          case WEB_SOCKET_API.SPOT_PRIVATE_DEALS_V3_API:
            console.log("Spot private deals event:", data);
            break;
          case WEB_SOCKET_API.SPOT_PRIVATE_ACCOUNT_V3_API:
            spotPrivateHandler();

            break;
          default:
            console.log("Unknown spot event:", eventName);
            break;
        }
        break;
      default:
        console.log("Unknown trade type:", tradeType);
        break;
    }
  }

  onClose() {
    console.log("WebSocket connection closed. Attempting to reconnect...");
    this.reconnect();
  }

  onError(error) {
    console.error("WebSocket error:", error);
  }

  reconnect() {
    setTimeout(() => {
      console.log("Reconnecting WebSocket...");
      this.connect();
    }, 5000); // Attempt to reconnect every 5 seconds
  }

  // SUBSCRIPTION
  subscribeSpotPair(symbol) {
    if (!this.subscribeSpotPairList.includes(symbol)) {
      this.subscribeSpotPairList.push(symbol);
    }

    if (this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(
      JSON.stringify({
        method: "SUBSCRIPTION",
        params: [
          `spot@${WEB_SOCKET_API.SPOT_PUBLIC_LIMIT_DEPTH_V3_API}@${symbol}@5`,
        ],
      })
    );
  }
}
// Spot account information (real-time)
// After successful subscription, the server will push updates of account assets whenever the account balance or available balance changes.

// Request:
// {
//     "method": "SUBSCRIPTION",
//     "params": [
//         "spot@private.account.v3.api"
//     ]
// }

// Response:
// {
//     "c": "spot@private.account.v3.api",
//     "d": {
//         "a": "USDT",
//         "c": 1678185928428,
//         "f": "302.185113007893322435",
//         "fd": "-4.990689704",
//         "l": "4.990689704",
//         "ld": "4.990689704",
//         "o": "ENTRUST_PLACE"
//     },
//     "t": 1678185928435
// }

// Request Parameters:
// spot@private.account.v3.api

// Response Parameters:

// Parameter     Data Type   Description
// d             json        Account information
// > a           string      Asset name
// > c           long        Settlement time
// > f           string      Available balance
// > fd          string      Available balance change
// > l           string      Frozen balance
// > ld          string      Frozen balance change
// > o           string      Change type
// t             long        Event time

// Spot account trades (real-time)
// Request:
// {
//     "method": "SUBSCRIPTION",
//     "params": [
//         "spot@private.deals.v3.api"
//     ]
// }

// Response:
// {
//     "c": "spot@private.deals.v3.api",
//     "d": {
//         "p": "1.804",
//         "v": "0.31",
//         "a": "0.55924",
//         "S": 1,
//         "T": 1678901086198,
//         "t": "5bbb6ad8b4474570b155610e3960cd",
//         "c": "",
//         "i": "2dd9655f9fa2438fa1709510d7afd9",
//         "m": 0,
//         "st": 0,
//         "n": "0.000248206380027431",
//         "N": "MX"
//     },
//     "s": "MXUSDT",
//     "t": 1661938980285
// }

// Request Parameters:
// spot@private.deals.v3.api

// Response Parameters:

// Parameter     Data Type   Description
// d             json        Account trade information
// > S           int         Trade type 1: Buy 2: Sell
// > T           long        Trade time
// > c           string      User-defined order id: clientOrderId
// > i           string      Order id: orderId
// > m           int         Whether it is a maker order: isMaker
// > p           string      Trade price
// > st          byte        Whether it is a self-trade: isSelfTrade
// > t           string      Trade id: tradeId
// > v           string      Trade quantity
// > a           string      Trade amount
// > n           string      Fee quantity
// > N           string      Fee currency
// s             string      Trading pair
// t             long        Event time

// Spot account orders (real-time)
// Request:
// {
//     "method": "SUBSCRIPTION",
//     "params": [
//         "spot@private.orders.v3.api"
//     ]
// }

// Request Parameters:
// spot@private.orders.v3.api

// a. Limit/Market Orders (real-time)
// Response:
// {
//     "c": "spot@private.orders.v3.api",
//     "d": {
//         "A": 8.0,
//         "O": 1661938138000,
//         "S": 1,
//         "V": 10,
//         "a": 8,
//         "c": "",
//         "i": "e03a5c7441e44ed899466a7140b71391",
//         "m": 0,
//         "o": 1,
//         "p": 0.8,
//         "s": 1,
//         "v": 10,
//         "ap": 0,
//         "cv": 0,
//         "ca": 0
//     },
//     "s": "MXUSDT",
//     "t": 1661938138193
// }

// Response Parameters:

// Parameter     Data Type   Description
// d             json        Account order information
// > A           bigDecimal  Remaining amount: remainAmount
// > O           long        Order creation time
// > S           int         Trade type 1: Buy 2: Sell
// > V           bigDecimal  Remaining quantity: remainQuantity
// > a           bigDecimal  Total order amount
// > c           string      User-defined order id: clientOrderId
// > i           string      Order id
// > m           int         Whether it is a maker order: isMaker
// > o           int         Order type LIMIT_ORDER(1), POST_ONLY(2), IMMEDIATE_OR_CANCEL(3),
//                           FILL_OR_KILL(4), MARKET_ORDER(5); Stop loss/take profit (100)
// > p           bigDecimal  Order price
// > s           int         Order status 1: Not filled 2: Filled 3: Partially filled 4: Canceled 5: Partially canceled
// > v           bigDecimal  Order quantity
// > ap          bigDecimal  Average execution price
// > cv          bigDecimal  Cumulative execution quantity
// > ca          bigDecimal  Cumulative execution amount
// t             long        Event time
// s             string      Trading pair

// b. Stop Loss/Take Profit Orders (real-time)
// Response:
// {
//     "c": "spot@private.orders.v3.api",
//     "d": {
//         "N": "USDT",
//         "O": 1661938853715,
//         "P": 0.9,
//         "S": 1,
//         "T": 1,
//         "i": "f6d82e5f41d745f59fe9d3cafffd80b5",
//         "o": 100,
//         "p": 1.01,
//         "s": "NEW",
//         "v": 6
//     },
//     "s": "MXUSDT",
//     "t": 1661938853727
// }

// Response Parameters:

// Parameter     Data Type   Description
// d             json        Account order information
// > N           string      Fee asset category
// > O           long        Order creation time
// > P           bigDecimal  Trigger price
// > S           int         Trade type 1: Buy 2: Sell
// > T           int         0: GE (Buy price greater than trigger price) 1: LE (Buy price less than trigger price)
// > i           string      Order id
// > o           int         Order type LIMIT_ORDER(1), POST_ONLY(2), IMMEDIATE_OR_CANCEL(3),
//                           FILL_OR_KILL(4), MARKET_ORDER(5); Stop loss/take profit (100)
// > p           bigDecimal  Order price
// > s           string      Order status NEW, CANCELED, EXECUTED, FAILED
// > v           bigDecimal  Order quantity
// s             string      Trading pair
// t             long        Event time
