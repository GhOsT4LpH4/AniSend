/** Status values matching the Soroban EscrowStatus enum */
export type DealStatus =
  | 'AwaitingDeposit'
  | 'Funded'
  | 'BuyerConfirmed'
  | 'SellerConfirmed'
  | 'Completed'
  | 'Cancelled';

/** On-chain deal data returned by get_escrow() */
export interface DealData {
  id: string;
  seller: string;
  buyer: string;
  token: string;
  amount: string;        // formatted USDC string, e.g. "45000.00"
  amountRaw: bigint;     // native representation
  description: string;   // e.g. "carabao"
  status: DealStatus;
}

/** Parameters for creating a new escrow deal */
export interface CreateDealParams {
  buyerAddress: string;
  tokenAddress: string;
  amountUSDC: number;
  description: string;
}
