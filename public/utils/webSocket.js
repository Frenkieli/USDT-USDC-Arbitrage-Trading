const WEB_SOCKET_API = {
  WS: "wss://wbs.mexc.com/ws",
  SPOT_PUBLIC_LIMIT_DEPTH_V3_API: "public.limit.depth.v3.api", //有限档位深度信息
  SPOT_PRIVATE_ACCOUNT_V3_API: "private.account.v3.api", // 现货账户信息(实时)
  // 现货账户成交(实时)
  SPOT_PRIVATE_DEALS_V3_API: "private.deals.v3.api",
  // A:现货账户订单(实时) B:账户止盈止损订单(实时)
  SPOT_PRIVATE_ORDERS_V3_API: "private.orders.v3.api",
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

// 现货账户信息(实时)
// 在订阅成功后，每当账户余额发生变动或可用余额发生变动时，服务器将推送账户资产的更新。

// request:

// {
//     "method": "SUBSCRIPTION",
//     "params": [
//     "spot@private.account.v3.api"
//     ]
// }
// response:

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
// 请求参数： spot@private.account.v3.api

// 返回参数:

// 参数名	数据类型	说明
// d	json	账户信息
// > a	string	资产名称
// > c	long	结算时间
// > f	string	可用余额
// > fd	string	可用变动金额
// > l	string	冻结余额
// > ld	string	冻结变动金额
// > o	string	变动类型
// t	long	事件时间
// 现货账户成交(实时)
// request:

// {
//     "method": "SUBSCRIPTION",
//     "params": [
//         "spot@private.deals.v3.api"
//     ]
// }
// response:

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
// 请求参数： spot@private.deals.v3.api

// 返回参数:

// 参数名	数据类型	说明
// d	json	账户成交信息
// > S	int	交易类型 1:买 2:卖
// > T	long	成交时间
// > c	string	用户自定义订单id: clientOrderId
// > i	string	订单id: orderId
// > m	int	是否是挂单: isMaker
// > p	string	交易价格
// > st	byte	是否自成交：isSelfTrade
// > t	string	成交id: tradeId
// > v	string	交易数量
// > a	string	交易金额
// > n	string	手续费数量
// > N	string	手续费币种
// s	string	交易对
// t	long	事件时间
// 现货账户订单(实时)
// request:

// {
//   "method": "SUBSCRIPTION",
//   "params": [
//       "spot@private.orders.v3.api"
//   ]
// }
// 请求参数： spot@private.orders.v3.api

// a.限价/市价订单 (实时)
// response:

// {
//   "c": "spot@private.orders.v3.api",
//   "d": {
//         "A":8.0,
//         "O":1661938138000,
//         "S":1,
//         "V":10,
//         "a":8,
//         "c":"",
//         "i":"e03a5c7441e44ed899466a7140b71391",
//         "m":0,
//         "o":1,
//         "p":0.8,
//         "s":1,
//         "v":10,
//         "ap":0,
//         "cv":0,
//         "ca":0
//   },
//   "s": "MXUSDT",
//   "t": 1661938138193
// }
// 返回参数:

// 参数名	数据类型	说明
// d	json	账户订单信息
// > A	bigDecimal	实际剩余金额: remainAmount
// > O	long	订单创建时间
// > S	int	交易类型 1:买 2:卖
// > V	bigDecimal	实际剩余数量: remainQuantity
// > a	bigDecimal	下单总金额
// > c	string	用户自定义订单id: clientOrderId
// > i	string	订单id
// > m	int	是否是挂单: isMaker
// > o	int	订单类型LIMIT_ORDER(1),POST_ONLY(2),IMMEDIATE_OR_CANCEL(3),
// FILL_OR_KILL(4),MARKET_ORDER(5); 止盈止损（100）
// > p	bigDecimal	下单价格
// > s	int	订单状态 1:未成交 2:已成交 3:部分成交 4:已撤单 5:部分撤单
// > v	bigDecimal	下单数量
// > ap	bigDecimal	平均成交价
// > cv	bigDecimal	累计成交数量
// > ca	bigDecimal	累计成交金额
// t	long	事件时间
// s	string	交易对
// b.账户止盈止损订单(实时)
// response:

// {
//   "c": "spot@private.orders.v3.api",
//   "d": {
//         "N":"USDT",
//         "O":1661938853715,
//         "P":0.9,
//         "S":1,
//         "T":1,
//         "i":"f6d82e5f41d745f59fe9d3cafffd80b5",
//         "o":100,
//         "p":1.01,
//         "s":"NEW",
//         "v":6
//   },
//   "s": "MXUSDT",
//   "t": 1661938853727
// }
// 返回参数:

// 参数名	数据类型	说明
// d	json	账户订单信息
// > N	string	手续费资产类别
// > O	long	订单创建时间
// > P	bigDecimal	触发价格
// > S	int	交易类型 1: 买 2: 卖
// > T	int	0: GE(买入价大过触发价) 1: LE(买入价小于触发价)
// > i	string	订单id
// > o	int	订单类型 LIMIT_ORDER(1),POST_ONLY(2),IMMEDIATE_OR_CANCEL(3),
// FILL_OR_KILL(4),MARKET_ORDER(5); 止盈止损（100）
// > p	bigDecimal	下单价格
// > s	string	订单状态 NEW ,CANCELED ,EXECUTED, FAILED
// > v	bigDecimal	下单数量
// s	string	交易对
// t	long	事件时间
