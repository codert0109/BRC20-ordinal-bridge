import cors from 'cors';
import express, { request } from 'express';
import session from 'express-session';
import cookieSession from 'cookie-session';
import { generateNonce, SiweMessage } from 'siwe';
import { core, address, utils } from '@unisat/wallet-sdk';
import dotenv from 'dotenv';
dotenv.config();
import cron from 'node-cron';
import { requestsCollection, addressesCollection } from './mongoConfig.js'
import { checkDeposit, checkJunks, checkTransferInscriptions } from './controller.js';
import { brcTickerFromEthAddress, ethAddressFromBrcTicker } from './utils.js'

cron.schedule('* * * * *', () => {
  console.log("======= CRON ========")
  checkDeposit();
  checkTransferInscriptions();
  checkJunks();
});

const NETWORK = core.bitcoin.networks.testnet

const app = express();
app.use(express.json());

//  Session setup
app.use(session({
  secret: 'wow very secret',
  cookie: {
    maxAge: 600000,
    secure: false
  },
  saveUninitialized: false,
  resave: false,
  unset: 'keep'
}));

app.use(cors({
  origin: ['http://localhost:3000', 'http://24.199.116.139:3000'],
  credentials: true,
  exposedHeaders: ['set-cookie']
}))

app.get('/nonce', async function (req, res) {
  req.session.nonce = generateNonce();
  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send(req.session.nonce);
});

app.post('/verify', async function (req, res) {
  try {
    if (!req.body.message) {
      res.status(422).json({ message: 'Expected prepareMessage object as body.' });
      return;
    }

    let SIWEObject = new SiweMessage(req.body.message);
    const { data: message } = await SIWEObject.verify({ signature: req.body.signature, nonce: req.session.nonce });

    console.log({ nonce: req.session.nonce })

    req.session.siwe = message;
    // req.session.cookie.expires = new Date(message.expirationTime);
    req.session.save(() => res.status(200).send(true));
  } catch (e) {
    req.session.siwe = null;
    req.session.nonce = null;
    console.error(e);
    switch (e) {
      // case ErrorTypes.EXPIRED_MESSAGE: {
      //   req.session.save(() => res.status(440).json({ message: e.message }));
      //   break;
      // }
      // case ErrorTypes.INVALID_SIGNATURE: {
      //   req.session.save(() => res.status(422).json({ message: e.message }));
      //   break;
      // }
      default: {
        req.session.save(() => res.status(500).json({ message: e.message }));
        break;
      }
    }
  }
});

app.get('/personal_information', function (req, res) {
  if (!req.session.siwe) {
    res.status(401).json({ message: 'You have to first sign_in' });
    return;
  }
  console.log("User is authenticated!");
  res.setHeader('Content-Type', 'text/plain');
  res.send(`You are authenticated and your address is: ${req.session.siwe.address}`);
});

const getReceiverAddress = async function (address) {
  let result = await addressesCollection.findOne({ eth: address })
  return result ? result.btc : await generateAddress(address)
}

const hasPendingRequest = async function (address, ticker) {
  let result = await requestsCollection.find({ $and: [{ type: 0 }, { completed: false, deposited: false }, { ethAddress: address }, { ticker: ticker }] }).limit(1).toArray();
  return result.length > 0
}

const fetchPendingRequests = async function (address) {
  let result = await requestsCollection.find({ $and: [{ type: 0 }, { completed: false, deposited: false }, { ethAddress: address }] }).limit(1).toArray();
  return result
}

const generateAddress = async function (eth) {
  const newPair = core.ECPair.makeRandom({
    network: NETWORK
  })
  const btc = core.bitcoin.payments.p2wpkh({ pubkey: newPair.publicKey, network: NETWORK }).address
  console.log("🔑 NEW ADDRESS GENERATED: ", btc);
  await addressesCollection.insertOne({
    privateKey: newPair.privateKey,
    btc,
    eth,
    balance: [],
  });
  return btc
}

app.post('/receive_address', async function (req, res) {
  console.log(req.session)
  if (!req.session.siwe) {
    res.status(401).json({ message: 'You have to first sign_in' });
    return;
  }
  try {
    const address = await getReceiverAddress(req.session.siwe.address);
    const pendingRequests = await fetchPendingRequests(req.session.siwe.address);
    res.status(200).json({ address, pendingRequests })
  } catch (e) {
    console.log({ e })
    res.status(500).json({ message: `Error. Receive address is not ready`, e });
  }
});

app.post('/request_brc_to_erc', async function (req, res) {
  if (!req.session.siwe) {
    res.status(401).json({ message: 'You have to first sign_in' });
    return;
  }
  let toAddress = await getReceiverAddress(req.session.siwe.address);
  const hasPending = await hasPendingRequest(req.session.siwe.address, req.body.ticker);
  if (hasPending) {
    req.session.save(() => res.status(500).json({ toAddress }));
    return;
  }
  const token = await ethAddressFromBrcTicker(req.body.tokenAddress)
  // Store request
  await requestsCollection.insertOne({
    type: 0,
    completed: false,
    deposited: false,
    burnt: false,
    ethAddress: req.session.siwe.address,
    ticker: req.body.ticker,
    amount: req.body.amount,
    token
  });
  const pendingRequests = await fetchPendingRequests(req.session.siwe.address);
  res.status(200).json({ address: toAddress, pendingRequests })
})

app.post('/request_erc_to_brc', async function (req, res) {
  if (!req.session.siwe) {
    res.status(401).json({ message: 'You have to first sign_in' });
    return;
  }
  const ticker = await brcTickerFromEthAddress(req.body.tokenAddress)
  await requestsCollection.insertOne({
    type: 1,
    completed: false,
    deposited: false,
    burnt: false,
    inscribing: false,
    transferred: false,
    btcAddress: req.body.btcAddress,
    ethAddress: req.session.siwe.address,
    ticker: ticker,
    token: req.body.tokenAddress,
  });
  res.status(200).json(true)
})


app.listen(4000, '0.0.0.0');
