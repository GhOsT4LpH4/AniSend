import {
  Contract, rpc, TransactionBuilder, BASE_FEE,
  nativeToScVal, scValToNative, xdr, StrKey
} from '@stellar/stellar-sdk';
import { STELLAR_RPC_URL, CONTRACT_ID, NETWORK_PASSPHRASE, USDC_CONTRACT_ID } from './config';
import { signWithFreighter } from './freighter';
import type { DealData, CreateDealParams } from '../types';

const server = new rpc.Server(STELLAR_RPC_URL);

function getContract() {
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

/**
 * Create a new livestock escrow deal on-chain.
 * The caller (seller) must authorize the transaction via Freighter.
 */
export async function createDeal(sellerAddress: string, params: CreateDealParams): Promise<string> {
  const account = await server.getAccount(sellerAddress);
  const contract = getContract();

  const amountRaw = Math.floor(params.amountUSDC * 10_000_000);
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
        addressToScVal(params.tokenAddress || USDC_CONTRACT_ID),
        amountScVal,
        nativeToScVal(params.description, { type: 'symbol' })
      )
    )
    .setTimeout(30)
    .build();

  const preparedTx = await server.prepareTransaction(tx);
  const signedXdr = await signWithFreighter(preparedTx.toXDR(), NETWORK_PASSPHRASE);

  const txHash = await server.sendTransaction(TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE));

  await new Promise(resolve => setTimeout(resolve, 5000));

  const status = await server.getTransaction(txHash.hash);
  if (status.status === 'SUCCESS' && status.returnValue) {
    return scValToNative(status.returnValue).toString();
  }

  return 'PENDING_CONFIRMATION';
}

/** Generic contract call for actions that take (caller, deal_id) */
async function genericContractCall(callerAddress: string, method: string, dealId: number) {
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
  await server.sendTransaction(TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE));
  await new Promise(resolve => setTimeout(resolve, 4000));
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

export async function getUsdcBalance(walletAddress: string): Promise<string> {
  const account = await server.getAccount(walletAddress);
  const usdcContract = new Contract(USDC_CONTRACT_ID);

  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(usdcContract.call('balance', addressToScVal(walletAddress)))
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
  };
}
