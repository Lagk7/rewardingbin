# 🌱 ECO BIN — Eco Rewarding Smart Bin Platform

A modern, responsive web application for the **ECO BIN — Eco Rewarding Bin** project with a green environmental theme, dynamic digital scale, automatic reward calculation (**10 grams = 1 point**), user dashboards with average weight tracking, and a competitive leaderboard.

---

## 🚀 Key Features

1. **Authentication & User Management:**
   - Account registration & secure login with cryptographic hashing (`PBKDF2`).
   - Quick **1-Click Demo Login** (`demo@ecobin.com` / `password123`) for instant testing.
   - User profile chip in the header with avatar, name, and live reward points balance.

2. **Manual Smart Scale Terminal:**
   - **Interactive Digital Scale:** Dynamic LED weight display, animated gauge meter, and real-time points counter.
   - **Waste Category Presets:**
     - 🍶 **Plastic** (~80g $\rightarrow$ 8 pts)
     - 🥤 **Metal & Cans** (~150g $\rightarrow$ 15 pts)
     - 📦 **Paper & Cardboard** (~400g $\rightarrow$ 40 pts)
     - 🫙 **Glass** (~350g $\rightarrow$ 35 pts)
     - 🍎 **Food / Organic** (~250g $\rightarrow$ 25 pts)
     - 🔋 **E-Waste** (~500g $\rightarrow$ 50 pts)
   - **Quick-Add Gram Chips:** `+20g`, `+50g`, `+100g`, `+250g`, `+500g`, `+1kg` with `Reset` button.
   - **Direct Weight Input:** Enter exact decimal grams (e.g. `245.5`).
   - **Audio Chime & Confetti:** Plays a synthesized celebration chime and confetti explosion upon deposit.

3. **Personalized Eco Dashboard:**
   - **Total Reward Points:** Live balance with glowing badge.
   - **Total Recycled Weight:** Displayed in both **Kilograms (kg)** and **Grams (g)**.
   - **Average Weight Put (g):** Prominently tracks the lifetime average amount of garbage placed by the user per visit, with dynamic Eco Tier badges (*Bronze*, *Silver*, *Gold*, or *Platinum*).
   - **Total Recycling Trips:** Lifetime interaction counter.
   - **Environmental Impact Metrics:** Real-time calculation of **Landfill Diverted (kg)**, **CO2 Avoided (kg)**, and **Tree Equivalent Days**.
   - **Recent Activity Feed:** Displays recent recycling deposits with weights, points, and categories.

4. **Competitive Global Leaderboard:**
   - 3D-styled Olympic podium for top 3 recyclers with Gold 👑, Silver 🥈, and Bronze 🥉 crowns.
   - Full ranked table with user avatars, total points, recycled weight (kg & g), average per trip, and tier badges.
   - Highlights the currently logged-in user's rank.

5. **Reward History Audit Log:**
   - Summary statistics (lifetime points, total kg, average per trip).
   - Full audit trail table: Date & Time, Description/Category, Garbage Weight (g), Running Average Weight (g), and Points Earned.
   - **One-Click Export to CSV** button.

6. **Eco Rewards Guide:**
   - Transparent breakdown of the **10 grams = 1 point** rule.
   - Waste sorting guidelines and recycling impact.

---

## 🌿 Eco Reward Formula
$$\text{Points} = \left\lfloor \frac{\text{Weight in Grams}}{10} \right\rfloor$$
- **10 grams = 1 Eco Point**
- **Example:** 180 grams = **18 Eco Points**
- **Example:** 1,250 grams (1.25 kg) = **125 Eco Points**

---

## ⚡ How to Run

1. Open a terminal in the project directory and start the server:
   ```powershell
   npm start
   ```
   *(Or double-click `start_server.bat`)*
2. Open your web browser to: **`http://localhost:5000`**
3. Click **"Quick Demo Login"** or create a new account, then open the **Garbage Scale** page to record deposits and earn points!
