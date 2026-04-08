# 🐃 AniSend

**Livestock auction escrow for Filipino smallholder farmers — powered by Stellar Soroban.**

---

## Problem

A smallholder carabao farmer in Nueva Ecija, Philippines lists a ₱45,000 draft animal on Facebook Marketplace but gets scammed by a buyer who sends a fake GCash screenshot — losing both the carabao and the payment, with zero recourse.

## Solution

AniSend lets the buyer deposit USDC into a Soroban escrow smart contract that auto-releases payment only when **both** buyer and seller confirm delivery on their phones — eliminating payment fraud at <₱0.50 gas cost, settling in 5 seconds.

---

## Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Smart Contract | Day 1 (4 hrs) | `lib.rs` — escrow logic, tests passing |
| Frontend MVP | Day 1–2 (6 hrs) | Mobile-first web UI (React/Next.js) |
| Testnet Deploy | Day 2 (2 hrs) | Contract deployed, demo flow working |
| Polish & Pitch | Day 2 (2 hrs) | Slide deck, 2-min demo recording |

## Stellar Features Used

- **USDC transfers** — stable-value payment, no crypto volatility
- **Soroban smart contracts** — mutual-confirmation escrow on-chain
- **Trustlines** — buyer/seller must hold USDC to participate

## Vision & Purpose

The Philippines has **12.5 million farming households**. Livestock fraud in rural Facebook groups is a documented, growing problem. AniSend brings **trustless escrow** to a market that has never had buyer protection — using Stellar's sub-cent fees to make escrow economically viable for $100–$800 transactions where Ethereum gas would eat the entire margin.

Our vision: **every livestock sale in the Philippines settles through AniSend** — eliminating scam risk for the most vulnerable sellers in the agricultural economy.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Rust** | ≥ 1.84.0 | [rustup.rs](https://rustup.rs) |
| **Soroban CLI** | ≥ 22.0.0 | `cargo install soroban-cli` |
| **WASM target** | — | `rustup target add wasm32-unknown-unknown` |

---

## How to Build

```bash
# Compile the contract to WASM
soroban contract build
```

The output WASM will be at:
```
target/wasm32-unknown-unknown/release/anisend.wasm
```

## How to Test

```bash
# Run all 5 unit tests
cargo test
```

Expected output:
```
running 5 tests
test test::test_happy_path_end_to_end ... ok
test test::test_unauthorized_deposit ... ok
test test::test_state_transitions ... ok
test test::test_cancel_refunds_buyer ... ok
test test::test_cannot_cancel_completed ... ok

test result: ok. 5 passed; 0 failed
```

## How to Deploy to Testnet

```bash
# 1. Configure Soroban for testnet
soroban network add \
  --global testnet \
  --rpc-url https://soroban-testnet.stellar.org:443 \
  --network-passphrase "Test SDF Network ; September 2015"

# 2. Generate a keypair and fund it
soroban keys generate --global deployer --network testnet
soroban keys fund deployer --network testnet

# 3. Deploy the contract
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/anisend.wasm \
  --source deployer \
  --network testnet
```

This will output the deployed **Contract ID** (e.g. `CABC...XYZ`).

## Sample CLI Invocation

```bash
# Replace CONTRACT_ID, SELLER_ADDR, BUYER_ADDR, USDC_TOKEN_ADDR with real values

# 1. Create an escrow listing (seller lists a carabao for 45000 USDC units)
soroban contract invoke \
  --id CONTRACT_ID \
  --source deployer \
  --network testnet \
  -- create_escrow \
  --seller SELLER_ADDR \
  --buyer BUYER_ADDR \
  --token USDC_TOKEN_ADDR \
  --amount 45000 \
  --description carabao

# 2. Buyer deposits into escrow
soroban contract invoke \
  --id CONTRACT_ID \
  --source buyer-key \
  --network testnet \
  -- deposit \
  --buyer BUYER_ADDR \
  --deal_id 0

# 3. Buyer confirms receipt
soroban contract invoke \
  --id CONTRACT_ID \
  --source buyer-key \
  --network testnet \
  -- confirm_buyer \
  --buyer BUYER_ADDR \
  --deal_id 0

# 4. Seller confirms handoff → funds released!
soroban contract invoke \
  --id CONTRACT_ID \
  --source seller-key \
  --network testnet \
  -- confirm_seller \
  --seller SELLER_ADDR \
  --deal_id 0

# 5. Query deal status
soroban contract invoke \
  --id CONTRACT_ID \
  --source deployer \
  --network testnet \
  -- get_escrow \
  --deal_id 0
```

---

## Project Structure

```
anisend/
├── Cargo.toml          # Rust manifest (soroban-sdk 22.0.0)
├── IDEA.md             # Full dApp specification
├── README.md           # This file
└── src/
    ├── lib.rs          # Soroban smart contract (6 public functions)
    └── test.rs         # 5 unit tests
```

## Contract Functions

| Function | Description | Auth Required |
|----------|-------------|---------------|
| `create_escrow` | Seller lists an animal for sale | Seller |
| `deposit` | Buyer locks USDC into escrow | Buyer |
| `confirm_buyer` | Buyer confirms animal received | Buyer |
| `confirm_seller` | Seller confirms animal handed over | Seller |
| `cancel` | Either party cancels, buyer refunded | Buyer or Seller |
| `get_escrow` | Read-only query for deal details | None |

---

## License

MIT — see [LICENSE](LICENSE) for details.
