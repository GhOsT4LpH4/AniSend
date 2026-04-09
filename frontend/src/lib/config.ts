import { Networks } from '@stellar/stellar-sdk';

export const STELLAR_RPC_URL = import.meta.env.VITE_STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
export const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK === 'public' ? Networks.PUBLIC : Networks.TESTNET;
export const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID || '';
// For the XLM demo we treat the escrow asset as "XLM via token interface".
// Set this to the network's Stellar Asset Contract (SAC) for native XLM (or a test token contract).
export const XLM_TOKEN_CONTRACT_ID =
  import.meta.env.VITE_XLM_TOKEN_CONTRACT_ID ||
  import.meta.env.VITE_USDC_CONTRACT_ID || // legacy env name fallback
  'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
