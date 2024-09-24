class TradingBot {
  constructor(apiKey, apiSecret) {
    if (TradingBot.instance) {
      return TradingBot.instance;
    }

    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.walletBalances = null;
    this.orderList = null;

    TradingBot.instance = this;
  }

  static getInstance(apiKey, apiSecret) {
    if (!TradingBot.instance) {
      TradingBot.instance = new TradingBot(apiKey, apiSecret);
    }
    return TradingBot.instance;
  }

  updateWalletOrderList(walletBalances, orderList, spotPairPrice) {
    this.walletBalances = walletBalances;
    this.orderList = orderList;
    this.spotPairPrice = spotPairPrice;

    this.adjustOrders();
  }

  getCurrentSpotPrice() {
    return {
      sellPrice: parseFloat(
        this.spotPairPrice.USDCUSDT.sellList[
          this.spotPairPrice.USDCUSDT.sellList.length - 1
        ].p
      ),
      buyPrice: parseFloat(this.spotPairPrice.USDCUSDT.buyList[0].p),
    };
  }

  // here is the place to adjust the target distribution
  calculateTargetDistribution(price) {
    // if (price >= 1.2) return { usdt: 1, usdc: 0 };
    // if (price >= 1.1) return { usdt: 1, usdc: 0 };
    // if (price >= 1.001) return { usdt: 1, usdc: 0 };
    if (price >= 1.0005) return { usdt: 1, usdc: 0 };
    if (price >= 1.0004) return { usdt: 0.9, usdc: 0.1 };
    if (price >= 1.0003) return { usdt: 0.8, usdc: 0.2 };
    if (price >= 1.0002) return { usdt: 0.7, usdc: 0.3 };
    if (price >= 1.0001) return { usdt: 0.6, usdc: 0.4 };
    if (price >= 1) return { usdt: 0.5, usdc: 0.5 };
    if (price >= 0.9999) return { usdt: 0.4, usdc: 0.6 };
    if (price >= 0.9998) return { usdt: 0.3, usdc: 0.7 };
    if (price >= 0.9997) return { usdt: 0.2, usdc: 0.8 };
    if (price >= 0.9996) return { usdt: 0.1, usdc: 0.9 };
    // if (price >= 0.9995) return { usdt: 0.1, usdc: 0.9 };
    // if (price >= 0.999) return { usdt: 0.05, usdc: 0.95 };
    // if (price >= 0.9) return { usdt: 0.1, usdc: 0.9 };
    return { usdt: 0, usdc: 1 };
  }

  calculateExistingOrders() {
    const existingBuyOrders = Object.values(this.orderList.buy)
      .flat()
      .reduce((acc, order) => {
        return acc + parseFloat(order.origQuoteOrderQty);
      }, 0);

    const existingSellOrders = Object.values(this.orderList.sell)
      .flat()
      .reduce((acc, order) => {
        return acc + parseFloat(order.origQuoteOrderQty);
      }, 0);

    return { existingBuyOrders, existingSellOrders };
  }

  adjustOrders() {
    const totalValue = this.walletBalances.usdtBalance.total;

    // here is the place to adjust the price levels
    const priceBuyLevels = [
      // 1.2,
      // 1.1,
      // 1.001,
      1.0005, 1.0004, 1.0003, 1.0002, 1.0001, 1, 0.9999, 0.9998, 0.9997, 0.9996,
      0.9995,
      // 0.999,
      //  0.9,
      // 0.8,
    ];

    const priceSellLevels = [...priceBuyLevels].reverse();

    const { buyPrice, sellPrice } = this.getCurrentSpotPrice();
    let toOrderList = [];
    let toCancelOrderList = [];

    let priceBuyIndex = 0;
    let buyList = [];

    for (let i = 0; i < priceBuyLevels.length; i++) {
      if (buyPrice >= priceBuyLevels[i]) {
        priceBuyIndex = i;
        break;
      }
    }

    // 買進方向
    for (let i = priceBuyIndex; i < priceBuyLevels.length; i++) {
      const price = priceBuyLevels[i];
      const targetDistribution = this.calculateTargetDistribution(price);
      const targetUSDC = totalValue * targetDistribution.usdc;
      const currentUSDC = this.walletBalances.pairBalance.pairTotal;
      const needBuyUSDC = targetUSDC - currentUSDC;
      let quantity = 0;

      if (needBuyUSDC > 0) {
        quantity =
          needBuyUSDC - buyList.reduce((acc, order) => acc + order.quantity, 0);
        buyList.push({
          price,
          quantity,
        });

        if (this.orderList.buy[price]) {
          const existingBuyOrders = this.orderList.buy[price].reduce(
            (acc, order) =>
              acc + parseFloat(order.origQty) - parseFloat(order.executedQty),
            0
          );

          if (existingBuyOrders < quantity) {
            toOrderList.push({
              side: "BUY",
              symbol: "USDCUSDT",
              quantity: quantity - existingBuyOrders,
              price,
            });
          } else {
            let nowPriceTotal = 0;

            for (let i = 0; i < this.orderList.buy[price].length; i++) {
              nowPriceTotal =
                nowPriceTotal +
                parseFloat(this.orderList.buy[price][i].origQty) -
                parseFloat(this.orderList.buy[price][i].executedQty);
              if (nowPriceTotal >= quantity) {
                toCancelOrderList.push(this.orderList.buy[price][i]);
                nowPriceTotal =
                  nowPriceTotal -
                  parseFloat(this.orderList.buy[price][i].origQty) +
                  parseFloat(this.orderList.buy[price][i].executedQty);
              }
            }
          }
        } else {
          toOrderList.push({
            side: "BUY",
            symbol: "USDCUSDT",
            quantity,
            price,
          });
        }
      }
    }

    let priceSellIndex = 0;
    let sellList = [];

    for (let i = 0; i < priceSellLevels.length; i++) {
      if (sellPrice >= priceSellLevels[i]) {
        priceSellIndex = i;
        break;
      }
    }

    // 賣出方向
    for (let i = priceSellIndex; i < priceSellLevels.length; i++) {
      const price = priceSellLevels[i];
      const targetDistribution = this.calculateTargetDistribution(price);
      const targetUSDT = totalValue * targetDistribution.usdt;
      const currentUSDT = this.walletBalances.usdtBalance.usdtTotal;
      const needSellUSDT = targetUSDT - currentUSDT;
      let quantity = 0;

      if (needSellUSDT > 0) {
        quantity =
          needSellUSDT -
          sellList.reduce((acc, order) => acc + order.quantity, 0);
        sellList.push({
          price,
          quantity,
        });
        if (this.orderList.sell[price]) {
          const existingSellOrders = this.orderList.sell[price].reduce(
            (acc, order) =>
              acc + parseFloat(order.origQty) - parseFloat(order.executedQty),
            0
          );
          if (existingSellOrders < quantity) {
            toOrderList.push({
              side: "SELL",
              symbol: "USDCUSDT",
              quantity: quantity - existingSellOrders,
              price,
            });
          } else {
            let nowPriceTotal = 0;

            for (let i = 0; i < this.orderList.sell[price].length; i++) {
              nowPriceTotal =
                nowPriceTotal +
                parseFloat(this.orderList.sell[price][i].origQty) -
                parseFloat(this.orderList.sell[price][i].executedQty);
              if (nowPriceTotal >= quantity) {
                toCancelOrderList.push(this.orderList.sell[price][i]);
                nowPriceTotal =
                  nowPriceTotal -
                  parseFloat(this.orderList.sell[price][i].origQty) +
                  parseFloat(this.orderList.sell[price][i].executedQty);
              }
            }
          }
        } else {
          toOrderList.push({
            side: "SELL",
            symbol: "USDCUSDT",
            quantity,
            price,
          });
        }
      }
    }

    if (toCancelOrderList.length > 0) {
      this.cancelOrder(toCancelOrderList);
    } else {
      this.placeOrder(toOrderList);
    }
  }

  placeOrder(toOrderList) {
    fetch(`/api/v3/order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        toOrderList.map((order) => ({ ...order, type: "LIMIT" }))
      ),
    }).then((res) => {
      return res.json();
    });
  }

  cancelOrder(toCancelOrderList) {
    fetch(`/api/v3/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        toCancelOrderList.map((order) => ({
          orderId: order.orderId,
          symbol: order.symbol,
          price: order.price,
        }))
      ),
    }).then((res) => {
      return res.json();
    });
  }
}

window.tradingBot = TradingBot.getInstance();
