//! # AniSend — Unit Tests
//!
//! Exactly 5 tests as required:
//! 1. Happy path: full end-to-end escrow flow (create → deposit → confirm → release)
//! 2. Edge case: unauthorized caller cannot deposit
//! 3. State verification: storage reflects correct status after each step
//! 4. Cancel-with-refund: funds returned to buyer on cancellation
//! 5. Edge case: cannot cancel an already-completed deal

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    testutils::Ledger,
    token::{StellarAssetClient, TokenClient},
    Address, Env, Symbol,
};

// ---------------------------------------------------------------------------
// Helper: set up a test environment with a token, seller, buyer, and admin
// ---------------------------------------------------------------------------
struct TestSetup {
    env: Env,
    seller: Address,
    buyer: Address,
    token_address: Address,
    token_client: TokenClient<'static>,
    contract_address: Address,
    contract_client: AniSendContractClient<'static>,
}

fn setup() -> TestSetup {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy the AniSend contract
    let contract_address = env.register(AniSendContract, ());

    // Create a test token (simulating USDC)
    let admin = Address::generate(&env);
    let (token_address, token_client, token_admin_client) = {
        let addr = env.register_stellar_asset_contract_v2(admin.clone());
        let tc: TokenClient = TokenClient::new(&env, &addr.address());
        let sac: StellarAssetClient = StellarAssetClient::new(&env, &addr.address());
        (addr.address(), tc, sac)
    };

    let seller = Address::generate(&env);
    let buyer  = Address::generate(&env);

    // Mint 100_000 tokens to the buyer (enough for the deal)
    token_admin_client.mint(&buyer, &100_000);

    let contract_client = AniSendContractClient::new(&env, &contract_address);

    TestSetup {
        env,
        seller,
        buyer,
        token_address,
        token_client,
        contract_address,
        contract_client,
    }
}

// ---------------------------------------------------------------------------
// Test 1 — Happy Path: full end-to-end escrow completes successfully
// ---------------------------------------------------------------------------
#[test]
fn test_happy_path_end_to_end() {
    let t = setup();
    let amount: i128 = 45_000;
    let desc = Symbol::new(&t.env, "carabao");

    // 1. Seller creates escrow
    let deal_id = t.contract_client.create_escrow(
        &t.seller,
        &t.buyer,
        &t.token_address,
        &amount,
        &desc,
    );
    assert_eq!(deal_id, 0);

    // 2. Buyer deposits
    t.contract_client.deposit(&t.buyer, &deal_id);

    // Tokens should now be held by the contract
    assert_eq!(t.token_client.balance(&t.buyer), 100_000 - amount);
    assert_eq!(t.token_client.balance(&t.contract_address), amount);

    // 3. Buyer confirms delivery
    t.contract_client.confirm_buyer(&t.buyer, &deal_id);

    // 4. Seller confirms delivery → triggers release
    t.contract_client.confirm_seller(&t.seller, &deal_id);

    // Funds should now be with the seller, contract balance = 0
    assert_eq!(t.token_client.balance(&t.seller), amount);
    assert_eq!(t.token_client.balance(&t.contract_address), 0);

    // Deal should be Completed
    let deal = t.contract_client.get_escrow(&deal_id);
    assert_eq!(deal.status, EscrowStatus::Completed);
}

// ---------------------------------------------------------------------------
// Test 2 — Edge Case: unauthorized address cannot deposit
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_unauthorized_deposit() {
    let t = setup();
    let amount: i128 = 45_000;
    let desc = Symbol::new(&t.env, "carabao");

    let deal_id = t.contract_client.create_escrow(
        &t.seller,
        &t.buyer,
        &t.token_address,
        &amount,
        &desc,
    );

    // A random stranger tries to deposit — should fail with Unauthorized
    let stranger = Address::generate(&t.env);
    t.contract_client.deposit(&stranger, &deal_id);
}

// ---------------------------------------------------------------------------
// Test 3 — State Verification: storage reflects correct status after each step
// ---------------------------------------------------------------------------
#[test]
fn test_state_transitions() {
    let t = setup();
    let amount: i128 = 10_000;
    let desc = Symbol::new(&t.env, "goat");

    // After create → AwaitingDeposit
    let deal_id = t.contract_client.create_escrow(
        &t.seller,
        &t.buyer,
        &t.token_address,
        &amount,
        &desc,
    );
    let deal = t.contract_client.get_escrow(&deal_id);
    assert_eq!(deal.status, EscrowStatus::AwaitingDeposit);

    // After deposit → Funded
    t.contract_client.deposit(&t.buyer, &deal_id);
    let deal = t.contract_client.get_escrow(&deal_id);
    assert_eq!(deal.status, EscrowStatus::Funded);

    // After seller confirms first → SellerConfirmed
    t.contract_client.confirm_seller(&t.seller, &deal_id);
    let deal = t.contract_client.get_escrow(&deal_id);
    assert_eq!(deal.status, EscrowStatus::SellerConfirmed);

    // After buyer confirms → Completed (both confirmed)
    t.contract_client.confirm_buyer(&t.buyer, &deal_id);
    let deal = t.contract_client.get_escrow(&deal_id);
    assert_eq!(deal.status, EscrowStatus::Completed);
}

// ---------------------------------------------------------------------------
// Test 4 — Cancel with Refund: buyer gets tokens back
// ---------------------------------------------------------------------------
#[test]
fn test_cancel_refunds_buyer() {
    let t = setup();
    let amount: i128 = 20_000;
    let desc = Symbol::new(&t.env, "pig");

    let deal_id = t.contract_client.create_escrow(
        &t.seller,
        &t.buyer,
        &t.token_address,
        &amount,
        &desc,
    );

    // Buyer deposits
    t.contract_client.deposit(&t.buyer, &deal_id);
    assert_eq!(t.token_client.balance(&t.buyer), 100_000 - amount);

    // Advance ledger past expiry, then buyer cancels to reclaim funds (prevents stuck escrow).
    t.env.ledger().with_mut(|li| {
        li.sequence_number = li.sequence_number.saturating_add(100);
    });
    t.contract_client.cancel(&t.buyer, &deal_id);

    // Buyer should get full refund
    assert_eq!(t.token_client.balance(&t.buyer), 100_000);
    assert_eq!(t.token_client.balance(&t.contract_address), 0);

    // Deal should be Cancelled
    let deal = t.contract_client.get_escrow(&deal_id);
    assert_eq!(deal.status, EscrowStatus::Cancelled);
}

// ---------------------------------------------------------------------------
// Test 5 — Edge Case: cannot cancel an already completed deal
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_cannot_cancel_completed() {
    let t = setup();
    let amount: i128 = 5_000;
    let desc = Symbol::new(&t.env, "chicken");

    let deal_id = t.contract_client.create_escrow(
        &t.seller,
        &t.buyer,
        &t.token_address,
        &amount,
        &desc,
    );

    t.contract_client.deposit(&t.buyer, &deal_id);
    t.contract_client.confirm_buyer(&t.buyer, &deal_id);
    t.contract_client.confirm_seller(&t.seller, &deal_id);

    // Deal is now Completed — cancelling should fail with InvalidState
    t.contract_client.cancel(&t.buyer, &deal_id);
}

// ---------------------------------------------------------------------------
// Test 8 — Timelock: seller cannot cancel after buyer has deposited
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_seller_cannot_cancel_after_deposit() {
    let t = setup();
    let amount: i128 = 10_000;
    let desc = Symbol::new(&t.env, "goat");

    let deal_id = t.contract_client.create_escrow(
        &t.seller,
        &t.buyer,
        &t.token_address,
        &amount,
        &desc,
    );

    t.contract_client.deposit(&t.buyer, &deal_id);
    t.contract_client.cancel(&t.seller, &deal_id);
}

// ---------------------------------------------------------------------------
// Test 9 — Timelock: buyer cannot cancel before expiry after deposit
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_buyer_cannot_cancel_before_expiry_after_deposit() {
    let t = setup();
    let amount: i128 = 10_000;
    let desc = Symbol::new(&t.env, "duck");

    let deal_id = t.contract_client.create_escrow(
        &t.seller,
        &t.buyer,
        &t.token_address,
        &amount,
        &desc,
    );

    t.contract_client.deposit(&t.buyer, &deal_id);
    t.contract_client.cancel(&t.buyer, &deal_id);
}

// ---------------------------------------------------------------------------
// Test 6 — Hardening: cannot create escrow with non-positive amount
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_create_escrow_rejects_zero_amount() {
    let t = setup();
    let amount: i128 = 0;
    let desc = Symbol::new(&t.env, "carabao");

    t.contract_client.create_escrow(
        &t.seller,
        &t.buyer,
        &t.token_address,
        &amount,
        &desc,
    );
}

// ---------------------------------------------------------------------------
// Test 7 — Hardening: cannot create escrow where seller == buyer
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_create_escrow_rejects_same_party() {
    let t = setup();
    let amount: i128 = 1;
    let desc = Symbol::new(&t.env, "carabao");

    t.contract_client.create_escrow(
        &t.seller,
        &t.seller,
        &t.token_address,
        &amount,
        &desc,
    );
}
