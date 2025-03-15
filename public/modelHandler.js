// modelHandler.js
class ModelHandler {
  constructor() {
    this.activeSpotPair = null;
    this.listenKey = null;
    this.spotPairPrice = {};
    this.orderList = { sell: {}, buy: {} };
    this.walletBalances = {};
  }

  static getInstance() {
    if (!ModelHandler.instance) {
      ModelHandler.instance = new ModelHandler();
    }
    return ModelHandler.instance;
  }

  setListenKey(listenKey) {
    this.listenKey = listenKey;

    layoutHandler.updateListenKey(listenKey);
  }

  setActiveSpotPair(spotPair) {
    this.activeSpotPair = spotPair;

    layoutHandler.updateActiveSpotPair(spotPair);
  }

  setSubscribeSpotPair({ spotPair }) {
    this.spotPairPrice[spotPair] = {};

    layoutHandler.updateSpotPairTab({
      spotPairKeyList: Object.keys(this.spotPairPrice),
    });

    this.setActiveSpotPair(spotPair);
  }

  setSpotPairPrice({ key, spotPairPrice }) {
    if (this.spotPairPrice[key]) {
      this.spotPairPrice[key] = spotPairPrice;
      // layoutHandler.updateSpotPairPrice({ spotPairPrice });
    } else {
      console.log("Spot pair not found");
    }
  }

  setWalletBalances(walletBalances, orderResult) {
    const { balances } = walletBalances;

    const activePair = this.activeSpotPair.replace("USDT", "");
    const usdtBalance = balances.find((balance) => balance.asset === "USDT");
    const pairBalance = balances.find(
      (balance) => balance.asset === activePair
    );

    let usdtTotal =
      parseFloat(usdtBalance?.free || 0) + parseFloat(usdtBalance?.locked || 0);
    let pairTotal =
      parseFloat(pairBalance?.free || 0) + parseFloat(pairBalance?.locked || 0);
    let total = usdtTotal + pairTotal;
    this.walletBalances = {
      usdtBalance: {
        ...usdtBalance,
        usdtTotal,
        pairTotal,
        total,
      },
      pairBalance: {
        ...pairBalance,
        usdtTotal,
        pairTotal,
        total,
      },
    };

    let buyOrderList = {};
    let sellOrderList = {};

    orderResult.forEach((orderList) => {
      if (orderList.side === "BUY") {
        if (!buyOrderList[orderList.price]) {
          buyOrderList[orderList.price] = [];
        }
        buyOrderList[orderList.price].push(orderList);
      } else if (orderList.side === "SELL") {
        if (!sellOrderList[orderList.price]) {
          sellOrderList[orderList.price] = [];
        }
        sellOrderList[orderList.price].push(orderList);
      }
    });

    this.orderList = {
      buy: buyOrderList,
      sell: sellOrderList,
    };

    layoutHandler.updateWalletBalances(this.walletBalances, this.orderList);
    tradingBot.updateWalletOrderList(
      this.walletBalances,
      this.orderList,
      this.spotPairPrice
    );
  }
}

window.modelHandler = ModelHandler.getInstance();
