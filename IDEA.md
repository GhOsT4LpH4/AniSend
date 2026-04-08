# 🐃 AniSend — Livestock Auction Escrow

---

## CONSTRAINTS

| Category | Selection |
|----------|-----------|
| **Region** | ✅ SEA (Philippines — Nueva Ecija, Pangasinan, Bukidnon) |
| **User Type** | ✅ Farmers · ✅ SMEs |
| **Complexity** | ✅ Soroban required · ✅ Mobile-first |
| **Theme** | ✅ Marketplace escrow · ✅ Farmer payments |

---

## PROJECT NAME

**AniSend** *(from Filipino "ani" = harvest/livestock + "send" = payment)*

---

## PROBLEM (1 sentence)

A smallholder carabao farmer in Nueva Ecija, Philippines lists a ₱45,000 draft animal on Facebook Marketplace but gets scammed by a buyer who sends a fake GCash screenshot — losing both the carabao and the payment, with zero recourse because informal livestock sales have no buyer protection and local courts take 8–12 months to resolve disputes.

---

## SOLUTION (1 sentence)

The farmer lists the carabao on AniSend, where the buyer deposits USDC into a Soroban escrow smart contract that auto-releases payment only when **both** buyer and seller confirm delivery on their phones — eliminating payment fraud at <₱0.50 gas cost, settling in 5 seconds instead of waiting days for bank transfers to clear.

---

## STELLAR FEATURES USED

| Feature | Why It's Used |
|---------|---------------|
| **USDC transfers** | Stable-value payment eliminates crypto volatility risk for farmers who think in pesos |
| **Soroban smart contracts** | Mutual-confirmation escrow logic enforced on-chain — no trusted middleman needed |
| **Trustlines** | Buyer and seller must hold USDC trustlines to receive payments |

---

## TARGET USERS

| Field | Detail |
|-------|--------|
| **Who** | Smallholder livestock farmers (1–10 head of cattle/carabao), rural livestock traders, barangay-level animal brokers |
| **Income** | ₱8,000–₱25,000/month (~$140–$440 USD) — a single scam can wipe out 2+ months of income |
| **Where** | Nueva Ecija, Pangasinan, Isabela, Bukidnon, Leyte — top livestock-producing provinces in the Philippines |
| **Behavior** | Already uses Facebook Marketplace / Viber groups to buy/sell animals; has GCash or Maya wallet; owns an Android phone |
| **Why they care** | A single ₱45,000 scam is devastating. AniSend costs nothing to use and gives them the confidence to sell to strangers outside their barangay |

---

## CORE FEATURE (MVP)

**One end-to-end transaction flow, demo-able in under 2 minutes:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  USER ACTION              │  ON-CHAIN ACTION           │  RESULT   │
├─────────────────────────────────────────────────────────────────────┤
│ 1. Seller taps "Sell      │ create_escrow() writes     │ Deal #0   │
│    Carabao" and sets       │ EscrowDeal to instance     │ created   │
│    price = 45,000 USDC     │ storage                    │ on-chain  │
│                            │                            │           │
│ 2. Buyer taps "Pay Now"   │ deposit() transfers        │ USDC held │
│    and approves USDC       │ 45,000 USDC from buyer     │ in escrow │
│    withdrawal              │ → contract address         │           │
│                            │                            │           │
│ 3. Buyer inspects animal, │ confirm_buyer() sets       │ Status =  │
│    taps "I Received It"    │ status = BuyerConfirmed    │ partial   │
│                            │                            │           │
│ 4. Seller taps "I Handed  │ confirm_seller() detects   │ 45,000    │
│    It Over"                │ both confirmed → calls     │ USDC sent │
│                            │ release_funds() to seller  │ to seller │
└─────────────────────────────────────────────────────────────────────┘
```

**Cancel flow:** Either party taps "Cancel" at any point before both confirmations → `cancel()` refunds the buyer automatically.

---

## WHY THIS WINS

**Stellar hackathon fit:** This is a real, underserved market — the Philippines has 12.5 million farming households and livestock fraud is a documented problem in rural FB Marketplace groups. The contract uses Soroban's unique low fees (<$0.01) to make escrow viable for $100–$800 transactions where Ethereum gas would eat the profit. Judges will find it compelling because it targets an audience that *no existing crypto product serves* — rural farmers already comfortable with mobile payments (GCash penetration is 76% in PH) but who have zero access to trustless escrow.

---

## OPTIONAL EDGE (BONUS POINTS)

| Enhancement | Description |
|-------------|-------------|
| **AI Integration** | GPT-powered livestock price estimator — seller uploads a photo of the animal, AI returns a fair market price range based on breed, weight estimate, and provincial price index (DA-BAI data). Prevents overpricing / underpricing. |
| **Local Anchor** | Partner with **Coins.ph** or **Maya** as a local Stellar anchor for PHP ↔ USDC on/off-ramp, so farmers never need to think about "crypto" |
| **Wallet UX** | Passkey-based Stellar wallet (no seed phrase) — farmer signs up with their phone number, wallet is created behind the scenes |
| **Offline Support** | SMS-based confirmation for areas with poor data — farmer texts "CONFIRM 0" to a Twilio number that calls the contract on their behalf |

---

## CONTRACT ARCHITECTURE

```
src/
├── lib.rs          # Main contract: 6 public functions
│   ├── create_escrow()    — seller lists animal
│   ├── deposit()          — buyer locks USDC
│   ├── confirm_buyer()    — buyer confirms receipt
│   ├── confirm_seller()   — seller confirms handoff
│   ├── cancel()           — either party cancels + refund
│   └── get_escrow()       — read-only deal query
└── test.rs         # 5 unit tests
    ├── test_happy_path_end_to_end
    ├── test_unauthorized_deposit
    ├── test_state_transitions
    ├── test_cancel_refunds_buyer
    └── test_cannot_cancel_completed
```

---

## STATE MACHINE

```
  AwaitingDeposit
       │
       ▼ deposit()
     Funded ──────────── cancel() ──→ Cancelled (refund)
       │
       ├─ confirm_buyer() ──→ BuyerConfirmed
       │                          │
       │                          ▼ confirm_seller()
       │                      Completed (funds released)
       │
       └─ confirm_seller() ──→ SellerConfirmed
                                  │
                                  ▼ confirm_buyer()
                              Completed (funds released)
```
