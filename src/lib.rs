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
    token, Address, Env, Symbol, symbol_short,
};

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
    /// The deposit amount does not match the listing price.
    AmountMismatch = 4,
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
        // Seller must authorize the listing creation
        seller.require_auth();

        // Generate an auto-incrementing ID
        let id: u64 = env
            .storage()
            .instance()
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
        };

        // Persist the deal and bump the counter
        env.storage().instance().set(&DataKey::Escrow(id), &deal);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

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
        buyer.require_auth();

        let mut deal: EscrowDeal = env
            .storage()
            .instance()
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
        env.storage().instance().set(&DataKey::Escrow(deal_id), &deal);

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
        buyer.require_auth();

        let mut deal: EscrowDeal = env
            .storage()
            .instance()
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

        env.storage().instance().set(&DataKey::Escrow(deal_id), &deal);

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
        seller.require_auth();

        let mut deal: EscrowDeal = env
            .storage()
            .instance()
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

        env.storage().instance().set(&DataKey::Escrow(deal_id), &deal);

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
        caller.require_auth();

        let mut deal: EscrowDeal = env
            .storage()
            .instance()
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

        // If funds were deposited, refund the buyer
        if deal.status != EscrowStatus::AwaitingDeposit {
            let token_client = token::Client::new(&env, &deal.token);
            token_client.transfer(
                &env.current_contract_address(),
                &deal.buyer,
                &deal.amount,
            );
        }

        deal.status = EscrowStatus::Cancelled;
        env.storage().instance().set(&DataKey::Escrow(deal_id), &deal);

        env.events()
            .publish((symbol_short!("cancel"),), deal_id);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // 6. GET ESCROW — Read-only query for deal details
    // -----------------------------------------------------------------------
    /// Returns the full EscrowDeal struct for a given deal ID.
    pub fn get_escrow(env: Env, deal_id: u64) -> Result<EscrowDeal, EscrowError> {
        env.storage()
            .instance()
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
