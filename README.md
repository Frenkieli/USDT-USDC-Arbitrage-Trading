# USDT/USDC Arbitrage Trading Bot for MEXC

Hello everyone! I’ve developed a spot arbitrage trading bot specifically for the USDT/USDC pair on MEXC Exchange.

## How It Works

The bot's core logic is simple yet effective: it buys USDT when the price reaches **0.9999** and sells when it hits **1**. It operates within a spread of **0.9995 - 1.0005**, continuously making small trades and distributing your funds within this range. Each successful trade generates a small profit, and since the funds remain in MEXC, they also benefit from the exchange's flexible interest rates.

### Estimated Profits

Based on a month of operation, the estimated monthly profit is around **9%**. Below is a sample of profit records:

- 2024/8/9 - 3331.19
- 2024/8/10 - 3336.14
- 2024/8/11 - 3348.84
- 2024/9/9 - 3565.54
- ... (other entries)

## How to Start Arbitrage Trading

1. Download the project and unzip it.
2. Download and install Node.js: [https://nodejs.org/](https://nodejs.org/)
3. Open the command prompt and navigate to the project folder.
4. Create an account on MEXC Exchange using this [link](https://www.mexc.com/register?inviteCode=1iKXW).
5. Generate an API key and secret in your MEXC account.
6. Create a `.env` file in the project folder and add your API and Secret Keys like this:

   ```plaintext
   API_KEY=XXX
   SECRET_KEY=XXX
   ```

7. Run the following command to install dependencies:

   ```bash
   npm install
   ```

8. After installation, start the bot by running:

   ```bash
   npm start
   ```

The bot will now start automating your USDT/USDC arbitrage trades.
