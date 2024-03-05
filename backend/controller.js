import { MongoClient, ObjectId } from "mongodb";
import fetch from 'node-fetch';
import { ethers } from 'ethers';
import Web3 from "web3";
import {
  mintTokens,
  approveForBurn,
  burnTokens,
} from './contract-methods.js'

import { requestsCollection, addressesCollection } from "./mongoConfig.js";
import { checkOrder, sendBrc, sendInscription, brcbalance } from "./unisat.js";

let THIRTY_MINUTES = 30 * 60 * 1000;

const BRIDGE_WALLET = process.env.BRIDGE_WALLET
const BRIDGE_WALLET_KEY = process.env.BRIDGE_PRIV_KEY

const wsProvider = new Web3.providers.WebsocketProvider(
  "wss://eth-sepolia.g.alchemy.com/v2/EiMk6jiht1swIUQsPCnIJcNLku7kMMw-",
  {
    clientConfig: {
      keepalive: true,
      keepaliveInterval: 60000
    },
    reconnect: {
      auto: true,
      delay: 5000,
      maxAttempts: 5,
      onTimeout: false
    }
  }
);
wsProvider.on('connect', () => {
  console.log("Websocket connected.");
});
wsProvider.on('close', (event) => {
  console.log(event);
  console.log("Websocket closed.");
});
wsProvider.on('error', (error) => {
  console.error(error);
});

const destinationWebSockerProvider = new Web3(wsProvider);
destinationWebSockerProvider.eth.subscribe("newBlockHeaders")
  .on('data', (data) => {
    console.log(
      `Received block header for block number ${data.number}.`
    );
  }).on('error', (error) => {
    console.error(error);
    console.error(
      "An error occured on the new blocks subscription."
    );
  }).on('connected', (id) => {
    console.log(
      `NewBlockHeaders subscription connected (${id})`
    );
  });
destinationWebSockerProvider.eth.subscribe('logs', {
  address: [
    '0xeF54a646A03c0Fd1Ac961dc985Ae6753ac21270F',
    // ...
  ], topics: [
    Web3.utils.sha3('Transfer(address,address,uint256)')
  ]
}).on('data', async (event) => {
  // get contract address, filter by transfer
  let transaction = destinationWebSockerProvider.eth.abi.decodeLog([{
    type: 'address',
    name: 'from',
    indexed: true
  }, {
    type: 'address',
    name: 'to',
    indexed: true
  }, {
    type: 'uint256',
    name: 'value',
    indexed: false
  }],
    event.data,
    [event.topics[1], event.topics[2], event.topics[3]]);
  handleDestinationEvent(event.address, transaction.from, transaction.to, transaction.value)
})

export async function checkDeposit() {
  console.log("💰 DEPOSIT CHECKING")
  let query = { $and: [{ type: 0 }, { completed: false }, { deposited: false }] };
  let result = await requestsCollection.find(query)
    .toArray();

  console.log("connected", result)

  for (let i = 0; i < result.length; i++) {

    const address = await addressesCollection.findOne({ eth: result[i].ethAddress })
    if (!address) continue;
    const balance = await brcbalance(address.btc, result[i].ticker)
    console.log({ balance })
    if (balance >= Number(address.balance[result[i].ticker] ?? 0) + result[i].amount) {
      address.balance[result[i].ticker] = balance
      console.log(address.balance)
      await addressesCollection.updateOne({ _id: address._id }, { $set: { balance: address.balance } })
      await requestsCollection.updateOne(result[i], { $set: { deposited: true } })
      const tokensMinted = await mintTokens(result[i].token, ethers.parseUnits(String(result[i].amount), 18), result[i].ethAddress)
      console.log("💰 DEPOSITed! So minting now!", { tokensMinted })
    }
  }
}

export async function checkJunks() {
  console.log("🔂 JUNK REQUESTS CHECKING")
  let bridges = await requestsCollection.find({ type: 0, completed: false, deposited: false })
    .toArray();
  let bridgeBacks = await requestsCollection.find({ type: 1, completed: false, transferred: false })
    .toArray();
  const result = [...bridges, ...bridgeBacks]

  if (result.length === 0) {
    console.log("No pending requests");
    return;
  }

  let deleted = 0;
  for (let i = 0; i < result.length; i++) {
    if (new Date().valueOf() - new ObjectId(result[i]._id).getTimestamp().valueOf() > THIRTY_MINUTES) {
      await requestsCollection.updateOne(result[i], { $set: { completed: true } })
      deleted++;
    }
  }
  console.log(`🧹 Cleared ${deleted} requests of ${result.length}`);
}

export async function checkTransferInscriptions() {
  let query = { $and: [{ type: 1 }, { completed: false }, { inscribing: true }] };
  let result = await requestsCollection.find(query)
    .toArray();
  console.log("📝 INCSCIRTIPN CHECKING")
  if (result === null) {
    return;
  } else {
    console.log(`FOUND ${result.length} transferInscriptions pending`);
    for (let i = 0; i < result.length; i++) {
      const inscriptionId = await checkOrder(result[i].orderId)
      if (inscriptionId) {
        console.log(`inscription ${inscriptionId} Finished! Sending it!!`);
        await sendInscription(inscriptionId, result[i].btcAddress)
        await requestsCollection.updateOne(result[i], { $set: { completed: true } })
        console.log('🌈🌈🌈🌈🌈 Bridge back operation completed. Check your arrival in btc!!')
      }
    }
  }
}

const handleMintedEvent = async (
  token, to, value,
) => {
  console.log('handleMintedEvent')
  console.log('token :>> ', token)
  console.log('from :>> ', to)
  console.log('value :>> ', value)
  console.log('============================')

  console.log('Tokens minted')

  let query = { $and: [{ type: 0 }, { completed: false }, { deposited: true }, { ethAddress: to }, { token }] };
  let result = await requestsCollection.find(query).limit(1)
    .toArray();
  if (!result) return;
  await requestsCollection.updateOne(result[0], { $set: { completed: true } })
  console.log('🌈🌈🌈🌈🌈 Bridge operation completed. Check your arrival in Ethereum wallet!!')

}

const handleDestinationEvent = async (
  token, from, to, value,
) => {
  console.log('handleDestinationEvent')
  console.log('token :>> ', token)
  console.log('to :>> ', to)
  console.log('from :>> ', from)
  console.log('value :>> ', value)
  console.log('============================')

  if (from == process.env.WALLET_ZERO) {
    handleMintedEvent(token, to, value)
    return
  }

  if (to == BRIDGE_WALLET && to != from) {
    console.log(
      'Tokens received on bridge from destination chain! Time to bridge back!'
    )

    let query = { $and: [{ type: 1 }, { completed: false }, { transferred: false }, { ethAddress: from }, { token }] };
    let result = await requestsCollection.findOne(query)

    if (!result) {
      console.log("NO DB RECORD??")
      return;
    }
    await requestsCollection.updateOne({ _id: result._id }, { $set: { transferred: true } });

    try {
      // we need to approve burn, then burn
      const tokenBurnApproved = await approveForBurn(
        token,
        value
      )
      if (!tokenBurnApproved) return
      console.log('Tokens approved to be burnt')
      const tokensBurnt = await burnTokens(token, value)

      if (!tokensBurnt) return
      console.log(
        'Tokens burnt on destination, time to transfer tokens in BTC side'
      )
      // SEND ORDIANL TO RECEVING ADDRESS!!
      // const transferBack = await transferToEthWallet(
      //   provider,
      //   contract,
      //   value,
      //   from
      // )
      await requestsCollection.updateOne({ _id: result._id }, { $set: { burnt: true } });
      const orderId = await sendBrc(result.ticker, ethers.formatEther(value))
      if (!orderId) return;
      console.log("mongo record id:", result._id)
      await requestsCollection.updateOne({ _id: result._id }, { $set: { inscribing: true, orderId } });
      console.log(orderId)
      // Save TxID
      console.log('Transfer Inscription created to BTC wallet. Waiting for the order minted...')
    } catch (err) {
      console.error('Error processing transaction', err)
      // TODO: return funds
    }
  } else {
    console.log('Something else triggered Transfer event')
  }
}
