# Introduction

This arbitrage trading bot is specifically designed for the USDT/USDC spot trading pair on MEXC Exchange, leveraging market price fluctuations to generate stable profits through a grid trading strategy. By continuously buying low and selling high within a predefined price range, the bot efficiently capitalizes on micro-price movements.

## How It Works

The bot follows a straightforward yet effective approach:

- Buy USDT when the price is ≤ 0.9999.
- Sell USDT when the price is ≥ 1.0000.
- Executes high-frequency trades within the 0.999 - 1.001 price range.
- Dynamically allocates and redistributes funds to maximize capital efficiency.
- Automatically converts small-balance assets to MX when rewards are distributed (typically at their peak value).

Because the arbitrage funds remain within MEXC Exchange, users also benefit from the platform's flexible deposit interest, further enhancing overall returns.

### Estimated Profits

Based on a month of operation, the estimated monthly profit is around **9%**. Below is a sample of profit records:

- 2024/8/9 - 3331.19
- 2024/8/10 - 3336.14
- 2024/8/11 - 3348.84
- 2024/9/9 - 3565.54
- ... (other entries see file account_total_log.txt)

## How to Get Started

1. Download the project and unzip it.
2. Download and install Node.js: [https://nodejs.org/](https://nodejs.org/)
3. Create an account on MEXC Exchange using this [link](https://www.mexc.com/register?inviteCode=1iKXW).
4. Generate an API key and secret in your MEXC account.
   > step  
   > to API Management Create New API Key  
   > set Account： View Account Details  
   > set Trade： View Order Details Trade  
   > enter Notes (Required) what you want  
   > then click create  
   > go to "My API Key" setting you just create  
   > change Trading Pairs  
   > Add Trading Pairs => USDC/USDT  
   > done
5. Create a `.env` file in the project folder and add your API and Secret Keys like this:

   ```plaintext
   API_KEY=XXX
   SECRET_KEY=XXX
   ```

6. Open the command prompt and navigate to the project folder.
7. Run the following command to install dependencies:

   ```bash
   npm install
   ```

8. After installation, start the bot by running:

   ```bash
   npm start
   ```

The bot will now start automating your USDT/USDC arbitrage trades.
