#![no_std]

//! # AniSend — Livestock Auction Escrow
//!
//! A Soroban smart contract that enables trust-free livestock trading
//! for Filipino smallholder farmers. A buyer deposits a payment (token amount)
//! into escrow; funds are released to the seller only when **both** parties
//! confirm that the animal was delivered. Either party can cancel before
//! confirmation, returning funds to the buyer.
//!
//! ## MVP Transaction Flow
//! 1. Seller calls `create_escrow` → listing stored on-chain
//! 2. Buyer calls `deposit` → tokens transferred to the contract
//! 3. Buyer calls `confirm_buyer` after inspecting the animal
//! 4. Seller calls `confirm_seller` after handing off the animal
//! 5. Contract auto-releases funds to the seller
//!
//! Either party may call `cancel` before both confirmations to refund the buyer.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    panic_with_error, token, Address, Env, Symbol, symbol_short,
};

/// Default timelock window in ledgers (Testnet ~5s/ledger => 17_280 ≈ 24 hours).
#[cfg(not(test))]
const DEFAULT_EXPIRY_LEDGERS: u32 = 17_280;
/// Shorter window in tests to avoid storage archival when fast-forwarding ledgers.
#[cfg(test)]
const DEFAULT_EXPIRY_LEDGERS: u32 = 50;
// Keep deal records alive well past the default expiry.
const DEAL_TTL_EXTEND_TO: u32 = DEFAULT_EXPIRY_LEDGERS + 50_000;
// Keep the contract instance itself alive during deal lifetime.
const INSTANCE_TTL_EXTEND_TO: u32 = DEFAULT_EXPIRY_LEDGERS + 100_000;

fn bump_instance_ttl(env: &Env) {
    env.storage().instance().extend_ttl(0, INSTANCE_TTL_EXTEND_TO);
}

// ---------------------------------------------------------------------------
// Storage keys & types
// ---------------------------------------------------------------------------

/// Unique key for each escrow deal, derived from a u64 ID.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Escrow(u64),      // per-deal data
    NextId,           // auto-incrementing deal counter
}

/// Possible states of an escrow deal.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EscrowStatus {
    AwaitingDeposit,      // listing created, no payment yet
    Funded,               // buyer deposited tokens
    BuyerConfirmed,       // buyer confirmed delivery
    SellerConfirmed,      // seller confirmed delivery
    Completed,            // both confirmed → funds released
    Cancelled,            // deal cancelled → funds refunded
}

/// On-chain record of a single livestock escrow deal.
#[contracttype]
#[derive(Clone)]
pub struct EscrowDeal {
    pub id: u64,
    pub seller: Address,
    pub buyer: Address,
    pub token: Address,        // e.g. USDC token contract address
    pub amount: i128,          // price in token smallest unit
    pub description: Symbol,   // short label, e.g. "carabao"
    pub status: EscrowStatus,
    /// Ledger when the deal was created.
    pub created_ledger: u32,
    /// Ledger after which the buyer can unilaterally cancel to avoid stuck funds.
    pub expires_ledger: u32,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EscrowError {
    /// The deal was not found in storage.
    NotFound = 1,
    /// The caller is not authorized for this action.
    Unauthorized = 2,
    /// The deal is not in the correct state for this action.
    InvalidState = 3,
    /// The caller provided an invalid amount (e.g. <= 0).
    InvalidAmount = 4,
    /// Seller and buyer cannot be the same address.
    SameParty = 5,
    /// The deal's timelock deadline has not been reached.
    DeadlineNotReached = 6,
    /// The caller is a valid party but is not allowed to perform this action.
    CancelNotAllowed = 7,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct AniSendContract;

#[contractimpl]
impl AniSendContract {

    // -----------------------------------------------------------------------
    // 1. CREATE ESCROW — Seller lists an animal for sale
    // -----------------------------------------------------------------------
    /// Creates a new escrow listing.
    ///
    /// * `seller`      – the farmer selling the animal (must authorize)
    /// * `buyer`       – the intended buyer's address
    /// * `token`       – the token contract address used for payment (e.g. USDC)
    /// * `amount`      – the agreed sale price in token smallest units
    /// * `description` – a short label for what is being sold (e.g. "carabao")
    ///
    /// Returns the new escrow deal ID.
    pub fn create_escrow(
        env: Env,
        seller: Address,
        buyer: Address,
        token: Address,
        amount: i128,
        description: Symbol,
    ) -> u64 {
        bump_instance_ttl(&env);
        // Seller must authorize the listing creation
        seller.require_auth();

        // Basic invariants (small checks, big confidence)
        if amount <= 0 {
            panic_with_error!(&env, EscrowError::InvalidAmount);
        }
        if seller == buyer {
            panic_with_error!(&env, EscrowError::SameParty);
        }

        let created_ledger = env.ledger().sequence();
        let expires_ledger = created_ledger.saturating_add(DEFAULT_EXPIRY_LEDGERS);

        // Generate an auto-incrementing ID
        let id: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::NextId)
            .unwrap_or(0);

        let deal = EscrowDeal {
            id,
            seller,
            buyer,
            token,
            amount,
            description,
            status: EscrowStatus::AwaitingDeposit,
            created_ledger,
            expires_ledger,
        };

        // Persist the deal and bump the counter (persistent storage to avoid archival)
        env.storage().persistent().set(&DataKey::Escrow(id), &deal);
        env.storage().persistent().set(&DataKey::NextId, &(id + 1));
        env.storage().persistent().extend_ttl(&DataKey::Escrow(id), 0, DEAL_TTL_EXTEND_TO);
        env.storage().persistent().extend_ttl(&DataKey::NextId, 0, DEAL_TTL_EXTEND_TO);

        // Emit an event for indexers / front-end
        env.events()
            .publish((symbol_short!("created"),), id);

        id
    }

    // -----------------------------------------------------------------------
    // 2. DEPOSIT — Buyer sends tokens into escrow
    // -----------------------------------------------------------------------
    /// Buyer deposits the exact listing price into the contract.
    ///
    /// Tokens are transferred from the buyer to this contract's address.
    pub fn deposit(env: Env, buyer: Address, deal_id: u64) -> Result<(), EscrowError> {
        bump_instance_ttl(&env);
        buyer.require_auth();

        let mut deal: EscrowDeal = env
            .storage()
            .persistent()
            .get(&DataKey::Escrow(deal_id))
            .ok_or(EscrowError::NotFound)?;

        // Only the designated buyer can deposit
        if deal.buyer != buyer {
            return Err(EscrowError::Unauthorized);
        }
        // Must be in AwaitingDeposit state
        if deal.status != EscrowStatus::AwaitingDeposit {
            return Err(EscrowError::InvalidState);
        }

        // Transfer tokens from buyer → this contract
        let token_client = token::Client::new(&env, &deal.token);
        token_client.transfer(
            &buyer,
            &env.current_contract_address(),
            &deal.amount,
        );

        deal.status = EscrowStatus::Funded;
        env.storage().persistent().set(&DataKey::Escrow(deal_id), &deal);
        env.storage().persistent().extend_ttl(&DataKey::Escrow(deal_id), 0, DEAL_TTL_EXTEND_TO);

        env.events()
            .publish((symbol_short!("deposit"),), deal_id);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // 3. CONFIRM BUYER — Buyer confirms animal was received
    // -----------------------------------------------------------------------
    /// Buyer confirms that the livestock has been received / inspected.
    ///
    /// If the seller has already confirmed, this triggers fund release.
    pub fn confirm_buyer(env: Env, buyer: Address, deal_id: u64) -> Result<(), EscrowError> {
        bump_instance_ttl(&env);
        buyer.require_auth();

        let mut deal: EscrowDeal = env
            .storage()
            .persistent()
            .get(&DataKey::Escrow(deal_id))
            .ok_or(EscrowError::NotFound)?;

        if deal.buyer != buyer {
            return Err(EscrowError::Unauthorized);
        }
        // Must be Funded or SellerConfirmed
        if deal.status != EscrowStatus::Funded
            && deal.status != EscrowStatus::SellerConfirmed
        {
            return Err(EscrowError::InvalidState);
        }

        if deal.status == EscrowStatus::SellerConfirmed {
            // Both confirmed → release funds
            Self::release_funds(&env, &deal);
            deal.status = EscrowStatus::Completed;
        } else {
            deal.status = EscrowStatus::BuyerConfirmed;
        }

        env.storage().persistent().set(&DataKey::Escrow(deal_id), &deal);
        env.storage().persistent().extend_ttl(&DataKey::Escrow(deal_id), 0, DEAL_TTL_EXTEND_TO);

        env.events()
            .publish((symbol_short!("c_buyer"),), deal_id);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // 4. CONFIRM SELLER — Seller confirms animal was handed over
    // -----------------------------------------------------------------------
    /// Seller confirms that they have delivered the livestock.
    ///
    /// If the buyer has already confirmed, this triggers fund release.
    pub fn confirm_seller(env: Env, seller: Address, deal_id: u64) -> Result<(), EscrowError> {
        bump_instance_ttl(&env);
        seller.require_auth();

        let mut deal: EscrowDeal = env
            .storage()
            .persistent()
            .get(&DataKey::Escrow(deal_id))
            .ok_or(EscrowError::NotFound)?;

        if deal.seller != seller {
            return Err(EscrowError::Unauthorized);
        }
        // Must be Funded or BuyerConfirmed
        if deal.status != EscrowStatus::Funded
            && deal.status != EscrowStatus::BuyerConfirmed
        {
            return Err(EscrowError::InvalidState);
        }

        if deal.status == EscrowStatus::BuyerConfirmed {
            // Both confirmed → release funds
            Self::release_funds(&env, &deal);
            deal.status = EscrowStatus::Completed;
        } else {
            deal.status = EscrowStatus::SellerConfirmed;
        }

        env.storage().persistent().set(&DataKey::Escrow(deal_id), &deal);
        env.storage().persistent().extend_ttl(&DataKey::Escrow(deal_id), 0, DEAL_TTL_EXTEND_TO);

        env.events()
            .publish((symbol_short!("c_seller"),), deal_id);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // 5. CANCEL — Either party cancels before full confirmation
    // -----------------------------------------------------------------------
    /// Either the buyer or the seller can cancel the deal before both have
    /// confirmed. If tokens have been deposited, they are refunded to the buyer.
    pub fn cancel(env: Env, caller: Address, deal_id: u64) -> Result<(), EscrowError> {
        bump_instance_ttl(&env);
        caller.require_auth();

        let mut deal: EscrowDeal = env
            .storage()
            .persistent()
            .get(&DataKey::Escrow(deal_id))
            .ok_or(EscrowError::NotFound)?;

        // Only buyer or seller can cancel
        if deal.buyer != caller && deal.seller != caller {
            return Err(EscrowError::Unauthorized);
        }
        // Cannot cancel a completed or already-cancelled deal
        if deal.status == EscrowStatus::Completed
            || deal.status == EscrowStatus::Cancelled
        {
            return Err(EscrowError::InvalidState);
        }

        // Cancellation rules:
        // - Before deposit: either party can cancel (no funds are locked).
        // - After deposit: only the buyer can cancel, and only after the timelock expires,
        //   to prevent funds being stuck indefinitely.
        if deal.status != EscrowStatus::AwaitingDeposit {
            if caller == deal.seller {
                return Err(EscrowError::CancelNotAllowed);
            }
            let now = env.ledger().sequence();
            if now < deal.expires_ledger {
                return Err(EscrowError::DeadlineNotReached);
            }

            // Funds were deposited: refund the buyer.
            let token_client = token::Client::new(&env, &deal.token);
            token_client.transfer(
                &env.current_contract_address(),
                &deal.buyer,
                &deal.amount,
            );
        }

        deal.status = EscrowStatus::Cancelled;
        env.storage().persistent().set(&DataKey::Escrow(deal_id), &deal);
        env.storage().persistent().extend_ttl(&DataKey::Escrow(deal_id), 0, DEAL_TTL_EXTEND_TO);

        env.events()
            .publish((symbol_short!("cancel"),), deal_id);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // 6. GET ESCROW — Read-only query for deal details
    // -----------------------------------------------------------------------
    /// Returns the full EscrowDeal struct for a given deal ID.
    pub fn get_escrow(env: Env, deal_id: u64) -> Result<EscrowDeal, EscrowError> {
        bump_instance_ttl(&env);
        env.storage()
            .persistent()
            .get(&DataKey::Escrow(deal_id))
            .ok_or(EscrowError::NotFound)
    }

    // -----------------------------------------------------------------------
    // Internal helper
    // -----------------------------------------------------------------------

    /// Transfers escrowed tokens from the contract to the seller.
    fn release_funds(env: &Env, deal: &EscrowDeal) {
        let token_client = token::Client::new(env, &deal.token);
        token_client.transfer(
            &env.current_contract_address(),
            &deal.seller,
            &deal.amount,
        );
    }
}

// Include the test module (in a separate file for cleanliness).
#[cfg(test)]
mod test;
