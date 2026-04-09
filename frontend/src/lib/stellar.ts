import {
  Contract, rpc, TransactionBuilder, BASE_FEE,
  nativeToScVal, scValToNative, xdr, StrKey
} from '@stellar/stellar-sdk';
import { STELLAR_RPC_URL, CONTRACT_ID, NETWORK_PASSPHRASE, XLM_TOKEN_CONTRACT_ID } from './config';
import { signWithFreighter } from './freighter';
import type { DealData, CreateDealParams } from '../types';

const server = new rpc.Server(STELLAR_RPC_URL);
const LEDGER_SECONDS_ESTIMATE = 5;

function getContract() {
  if (!CONTRACT_ID) {
    throw new Error('Missing CONTRACT_ID. Set VITE_CONTRACT_ID in your frontend .env.');
  }
  return new Contract(CONTRACT_ID);
}

/** Handle both G... (account) and C... (contract) addresses */
function addressToScVal(addr: string): xdr.ScVal {
  if (addr.startsWith('G')) {
    const rawKey = StrKey.decodeEd25519PublicKey(addr);
    return xdr.ScVal.scvAddress(
      xdr.ScAddress.scAddressTypeAccount(xdr.PublicKey.publicKeyTypeEd25519(rawKey))
    );
  } else if (addr.startsWith('C')) {
    const contractHash = StrKey.decodeContract(addr);
    return xdr.ScVal.scvAddress(
      // @ts-expect-error — Buffer works at runtime
      xdr.ScAddress.scAddressTypeContract(contractHash)
    );
  }
  throw new Error(`Unsupported address format: ${addr}`);
}

function isGAddress(addr: string): boolean {
  try {
    return addr.startsWith('G') && !!StrKey.decodeEd25519PublicKey(addr);
  } catch {
    return false;
  }
}

async function simulateAndReturn(tx: ReturnType<TransactionBuilder['build']>): Promise<unknown> {
  const simResult = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }
  if (!simResult.result || !simResult.result.retval) {
    throw new Error('No valid return value from simulation.');
  }
  return scValToNative(simResult.result.retval);
}

export async function getLatestLedgerSequence(): Promise<number> {
  const latest = await server.getLatestLedger();
  return Number(latest.sequence);
}

async function pollTxUntilDone(txHash: string, timeoutMs = 30_000): Promise<rpc.Api.GetTransactionResponse> {
  const start = Date.now();
  // Simple polling loop (Soroban RPC can take a few ledgers)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const status = await server.getTransaction(txHash);
    if (status.status !== 'NOT_FOUND') return status;
    if (Date.now() - start > timeoutMs) {
      throw new Error('Transaction submitted but not confirmed yet. Please refresh in a few seconds.');
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/**
 * Create a new livestock escrow deal on-chain.
 * The caller (seller) must authorize the transaction via Freighter.
 */
export async function createDeal(sellerAddress: string, params: CreateDealParams): Promise<string> {
  if (!isGAddress(sellerAddress)) throw new Error('Invalid seller address (must be a G... Stellar account).');
  if (!isGAddress(params.buyerAddress)) throw new Error('Invalid buyer address (must be a G... Stellar account).');

  const account = await server.getAccount(sellerAddress);
  const contract = getContract();

  // For the XLM demo: treat amount as token base units with 7 decimals.
  const amountRaw = Math.floor(params.amountXLM * 10_000_000);
  if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
    throw new Error('Invalid amount. Please enter a valid positive number.');
  }

  const amountScVal = xdr.ScVal.scvI128(
    new xdr.Int128Parts({ lo: xdr.Uint64.fromString(amountRaw.toString()), hi: xdr.Int64.fromString('0') })
  );

  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(
      contract.call('create_escrow',
        addressToScVal(sellerAddress),
        addressToScVal(params.buyerAddress),
        addressToScVal(params.tokenAddress || XLM_TOKEN_CONTRACT_ID),
        amountScVal,
        nativeToScVal(params.description, { type: 'symbol' })
      )
    )
    .setTimeout(30)
    .build();

  const preparedTx = await server.prepareTransaction(tx);
  const signedXdr = await signWithFreighter(preparedTx.toXDR(), NETWORK_PASSPHRASE);

  const send = await server.sendTransaction(TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE));
  const status = await pollTxUntilDone(send.hash, 45_000);
  if (status.status !== 'SUCCESS' || !status.returnValue) {
    throw new Error(`Transaction failed: ${status.status}`);
  }
  return scValToNative(status.returnValue).toString();
}

/** Generic contract call for actions that take (caller, deal_id) */
async function genericContractCall(callerAddress: string, method: string, dealId: number) {
  if (!isGAddress(callerAddress)) throw new Error('Invalid caller address (must be a G... Stellar account).');
  const account = await server.getAccount(callerAddress);
  const contract = getContract();

  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(contract.call(method,
      addressToScVal(callerAddress),
      nativeToScVal(dealId, { type: 'u64' })
    ))
    .setTimeout(30)
    .build();

  const preparedTx = await server.prepareTransaction(tx);
  const signedXdr = await signWithFreighter(preparedTx.toXDR(), NETWORK_PASSPHRASE);
  const send = await server.sendTransaction(TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE));
  const status = await pollTxUntilDone(send.hash, 45_000);
  if (status.status !== 'SUCCESS') {
    throw new Error(`Transaction failed: ${status.status}`);
  }
}

export async function deposit(buyerAddress: string, dealId: number): Promise<void> {
  return genericContractCall(buyerAddress, 'deposit', dealId);
}

export async function confirmBuyer(buyerAddress: string, dealId: number): Promise<void> {
  return genericContractCall(buyerAddress, 'confirm_buyer', dealId);
}

export async function confirmSeller(sellerAddress: string, dealId: number): Promise<void> {
  return genericContractCall(sellerAddress, 'confirm_seller', dealId);
}

export async function cancelDeal(callerAddress: string, dealId: number): Promise<void> {
  return genericContractCall(callerAddress, 'cancel', dealId);
}

export async function getXlmBalance(walletAddress: string): Promise<string> {
  const account = await server.getAccount(walletAddress);
  const xlmContract = new Contract(XLM_TOKEN_CONTRACT_ID);

  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(xlmContract.call('balance', addressToScVal(walletAddress)))
    .setTimeout(30)
    .build();

  const result = await simulateAndReturn(tx);
  const raw = Number(String(result));
  return (raw / 10_000_000).toFixed(2);
}

export async function getDeal(dealId: number, callerAddress: string): Promise<DealData> {
  const account = await server.getAccount(callerAddress);
  const contract = getContract();

  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(contract.call('get_escrow', nativeToScVal(dealId, { type: 'u64' })))
    .setTimeout(30)
    .build();

  const result = await simulateAndReturn(tx);
  const dataObj = result as Record<string, unknown>;

  const parseStatus = (statusVal: unknown) => {
    if (typeof statusVal === 'string') return statusVal;
    if (statusVal && typeof statusVal === 'object' && 'key' in statusVal) return (statusVal as { key: string }).key;
    if (Array.isArray(statusVal)) return statusVal[0];
    return Object.keys(statusVal as object || {})[0] || 'AwaitingDeposit';
  };

  let amountNum = 0;
  try {
    amountNum = Number(String(dataObj.amount));
    if (isNaN(amountNum)) amountNum = 0;
  } catch { amountNum = 0; }

  return {
    id: dealId.toString(),
    buyer: String(dataObj.buyer),
    seller: String(dataObj.seller),
    token: String(dataObj.token),
    amount: (amountNum / 10_000_000).toFixed(2),
    amountRaw: BigInt(amountNum || 0),
    description: String(dataObj.description || ''),
    status: parseStatus(dataObj.status) as DealData['status'],
    createdLedger: typeof dataObj.created_ledger === 'number' ? dataObj.created_ledger : Number(String(dataObj.created_ledger ?? '')),
    expiresLedger: typeof dataObj.expires_ledger === 'number' ? dataObj.expires_ledger : Number(String(dataObj.expires_ledger ?? '')),
  };
}

export function formatApproxTimeFromLedgers(ledgersRemaining: number): string {
  if (!Number.isFinite(ledgersRemaining) || ledgersRemaining <= 0) return 'now';
  const seconds = Math.max(0, Math.floor(ledgersRemaining * LEDGER_SECONDS_ESTIMATE));
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} hr`;
  const days = Math.floor(hours / 24);
  return `${days} day`;
}
