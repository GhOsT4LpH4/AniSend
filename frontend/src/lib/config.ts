import { Networks } from '@stellar/stellar-sdk';

export const STELLAR_RPC_URL = import.meta.env.VITE_STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
export const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK === 'public' ? Networks.PUBLIC : Networks.TESTNET;
export const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID || '';
export const USDC_CONTRACT_ID = import.meta.env.VITE_USDC_CONTRACT_ID || 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'; // Using Testnet XLM for testing
