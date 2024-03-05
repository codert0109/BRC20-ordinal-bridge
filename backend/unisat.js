import dotenv from 'dotenv';
import axios from "axios";
import { core, address, utils, txHelpers, wallet, AddressType, keyring } from '@unisat/wallet-sdk';

dotenv.config();
// const UNISAT_BASE_URL = "https://open-api.unisat.io/v2/inscribe/order/create/brc20-transfer"
// const UNISAT_BASE_URL = "https://open-api-testnet.unisat.io/v2/inscribe/order/create/brc20-mint"
const UNISAT_BASE_URL = "https://open-api-testnet.unisat.io/v2/inscribe/order/create/brc20-transfer"
const UNISAT_API_KEY = "8b51e0e29943e4731f35f7fec5d103e031899f77022c5de2660bd23611976b34"
const fromWallet = new wallet.LocalWallet(process.env.BRIDGE_BTC_PRIVATE, AddressType.P2WPKH, 1);

export async function dummySendBTC({
  wallet,
  btcUtxos,
  tos,
  feeRate,
  dump,
  enableRBF,
}) {
  const { psbt, toSignInputs } = await txHelpers.sendBTC({
    btcUtxos,
    tos,
    networkType: wallet.networkType,
    changeAddress: wallet.address,
    feeRate,
    enableRBF,
  });

  console.log({ psbt, toSignInputs })

  await wallet.signPsbt(psbt, { autoFinalized: true, toSignInputs });
  const tx = psbt.extractTransaction(true);
  const rawtx = psbt.extractTransaction().toHex();
  const txid = tx.getId();
  const inputCount = psbt.txInputs.length;
  const outputCount = psbt.txOutputs.length;
  const fee = psbt.getFee();
  const virtualSize = tx.virtualSize();
  const finalFeeRate = parseFloat((fee / virtualSize).toFixed(1));
  if (dump) {
    printPsbt(psbt);
  }
  return { psbt, txid, inputCount, outputCount, feeRate: finalFeeRate, rawtx };
}

let dummyUtxoIndex = 0;
export function genDummyUtxo(
  wallet,
  satoshis,
  assets,
  txid,
  vout
) {
  return {
    txid:
      txid ||
      "0000000000000000000000000000000000000000000000000000000000000000",
    vout: vout !== undefined ? vout : dummyUtxoIndex++,
    satoshis: satoshis,
    scriptPk: wallet.scriptPk,
    addressType: wallet.addressType,
    pubkey: wallet.pubkey,
    inscriptions: assets?.inscriptions || [],
    atomicals: assets?.atomicals || [],
  };
}

async function getBTCUtxos(wallet) {
  const { data: utxos } = await axios.get("https://wallet-api-testnet.unisat.io/v5/address/btc-utxo?address=" + wallet.address, {
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + UNISAT_API_KEY,
      "X-Address": wallet.address,
      "X-Client": "UniSat Wallet",
    },
  });

  return utxos.data.map((v) => {
    return {
      txid: v.txid,
      vout: v.vout,
      satoshis: v.satoshis,
      scriptPk: v.scriptPk,
      addressType: v.addressType,
      pubkey: wallet.pubkey,
      inscriptions: v.inscriptions,
      atomicals: v.atomicals
    };
  });
}

export async function brcbalance(address, ticker) {
  const { data: info } = await axios.get(`https://open-api-testnet.unisat.io/v1/indexer/address/${address}/brc20/${ticker}/info`, {
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + UNISAT_API_KEY,
      "X-Address": fromWallet.address,
      "X-Client": "UniSat Wallet",
    },
  })
  console.log({ info, address, ticker })
  if (info.msg == 'ok') return Number(info.data.overallBalance);
  return 0;
}

export async function sendBrc(ticker, brc20Amount) {

  console.log(process.env.BRIDGE_BTC_PRIVATE)


  console.log({ brc20Amount, ticker })
  const { data } = await axios.post(UNISAT_BASE_URL, {
    "receiveAddress": fromWallet.address,
    "feeRate": 1,
    "outputValue": 546,
    "devAddress": '',
    "devFee": 0,
    "brc20Ticker": ticker,
    "brc20Amount": brc20Amount
  }, {
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + UNISAT_API_KEY,
    },
  })
  console.log("openapi result: ", data)
  const { payAddress, amount, orderId } = data.data

  console.log('fromWallet address', fromWallet.address)
  const btcUtxos = await getBTCUtxos(fromWallet)
  console.log(btcUtxos)

  const { rawtx } = await dummySendBTC({
    wallet: fromWallet,
    btcUtxos,
    tos: [{ address: payAddress, satoshis: amount }],
    feeRate: 1,
  });

  const { data: response } = await broadcast(rawtx);
  console.log({ response })

  return orderId;

}

async function broadcast(rawtx) {
  console.log({ rawtx })
  const { data: final_result } = await axios.post("https://wallet-api-testnet.unisat.io/v5/tx/broadcast", {
    rawtx
  }, {
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + UNISAT_API_KEY,
      "X-Address": fromWallet.address,
      "X-Client": "UniSat Wallet",
    },
  })

  return final_result
}

export async function checkOrder(orderId) {

  const { data: { data: order } } = await axios.get(`https://open-api-testnet.unisat.io/v2/inscribe/order/${orderId}`, {
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + UNISAT_API_KEY,
      "X-Address": fromWallet.address,
      "X-Client": "UniSat Wallet",
    },
  })

  if (!order) return;
  if (order.status == 'minted') {
    return order.files[0].inscriptionId;
  }
}


export async function sendInscription(inscriptionId, toAddress) {

  const { data: utxo } = await axios.get("https://wallet-api-testnet.unisat.io/v5/inscription/utxo?inscriptionId=" + inscriptionId, {
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + UNISAT_API_KEY,
      "X-Address": fromWallet.address,
      "X-Client": "UniSat Wallet",
    },
  })

  if (!utxo) {
    throw new Error('UTXO not found.');
  }

  const assetUtxo = Object.assign(utxo.data, { pubkey: fromWallet.pubkey });
  const btcUtxos = await getBTCUtxos(fromWallet)
  if (btcUtxos.length == 0) {
    throw new Error('Insufficient balance.');
  }
  console.log({ assetUtxo })

  const { psbt, toSignInputs } = await txHelpers.sendInscription({
    assetUtxo,
    btcUtxos,
    toAddress,
    networkType: 1,
    changeAddress: fromWallet.address,
    "feeRate": 1,
    "outputValue": 546,
  });


  await fromWallet.signPsbt(psbt, { autoFinalized: true, toSignInputs });
  const tx = psbt.extractTransaction(true);
  const rawtx = psbt.extractTransaction().toHex();
  const txid = tx.getId();
  const inputCount = psbt.txInputs.length;
  const outputCount = psbt.txOutputs.length;
  const fee = psbt.getFee();
  const virtualSize = tx.virtualSize();
  const finalFeeRate = parseFloat((fee / virtualSize).toFixed(1));

  const { data: response } = await broadcast(rawtx);
  console.log({ response })

  return response

}