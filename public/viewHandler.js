document
  .getElementById("subscribeButtonId")
  .addEventListener("click", async (e) => {
    e.preventDefault();
    const selectedPair = document.getElementById("tradingPairId").value;
    webSocketHandler.subscribeSpotPair(selectedPair);
    modelHandler.setSubscribeSpotPair({ spotPair: selectedPair });

    const result = await fetch("/api/getAccount").then((res) => {
      return res.json();
    });

    const orderResult = await fetch(
      `/api/order?symbol=${modelHandler.activeSpotPair}`
    ).then((res) => {
      return res.json();
    });
    setTimeout(() => {
      modelHandler.setWalletBalances(result, orderResult);
    }, 1000);
  });

document
  .getElementById("linkWsButtonId")
  .addEventListener("click", async (e) => {
    e.preventDefault();
    const result = await fetch("/api/getListenKey").then((res) => {
      return res.json();
    });
    if (result.listenKey === undefined) {
      alert("Failed to get listen key");
      return;
    }

    modelHandler.setListenKey(result.listenKey);

    webSocketHandler = WebSocketHandler.getInstance(result.listenKey);
  });

document.getElementById("TESTButtonId").addEventListener("click", async (e) => {
  // e.preventDefault();
  const result = await fetch(`/test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      test: "test",
    }),
  }).then((res) => {
    return res.json();
  });
  // console.log("TESTButtonId", result);
});

(async () => {
  const result = await fetch("/api/getListenKey").then((res) => {
    return res.json();
  });
  if (result.listenKey === undefined) {
    alert("Failed to get listen key");
    return;
  }

  modelHandler.setListenKey(result.listenKey);

  webSocketHandler = WebSocketHandler.getInstance(result.listenKey);

  setTimeout(async () => {
    const selectedPair = document.getElementById("tradingPairId").value;
    webSocketHandler.subscribeSpotPair(selectedPair);
    modelHandler.setSubscribeSpotPair({ spotPair: selectedPair });

    const result = await fetch("/api/getAccount").then((res) => {
      return res.json();
    });

    const orderResult = await fetch(
      `/api/order?symbol=${modelHandler.activeSpotPair}`
    ).then((res) => {
      return res.json();
    });
    setTimeout(() => {
      modelHandler.setWalletBalances(result, orderResult);
    }, 1000);
  }, 500);
})();
