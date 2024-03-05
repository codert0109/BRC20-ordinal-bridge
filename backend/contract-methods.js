import Web3 from "web3";
import QCHSD_ABIJSON from './DChainstackDollars.json' assert { type: "json" };

const BRIDGE_WALLET = process.env.BRIDGE_WALLET
const BRIDGE_WALLET_KEY = process.env.BRIDGE_PRIV_KEY
let nonce = 0;

const provider = new Web3(new Web3.providers.HttpProvider("https://eth-sepolia.g.alchemy.com/v2/EiMk6jiht1swIUQsPCnIJcNLku7kMMw-"))
// adds account to sign transactions
provider.eth.getTransactionCount(BRIDGE_WALLET).then(res => nonce = res)
provider.eth.accounts.wallet.add(BRIDGE_WALLET_KEY)

const sendTransaction = async (token, data) => {
  let txcount = await provider.eth.getTransactionCount(BRIDGE_WALLET);
  console.log("txcount: >>", txcount)
  console.log('nonce :>>', nonce)
  nonce = Math.max(nonce, txcount)
  const gasPrice = Number(await provider.eth.getGasPrice())

  const trxData = {
    // trx is sent from the bridge wallet
    from: BRIDGE_WALLET,
    // destination of the transaction is the ERC20 token address
    to: token,
    data,
    gas: 1000000,
    gasPrice: parseInt(gasPrice * 1.5),
    nonce,
  }
  nonce ++;
  return await provider.eth.sendTransaction(trxData)
  // return await new Promise((resolve, reject) => {
  //   const intervalId = setInterval(async () => {
  //     const receipt = await provider.eth.sendTransaction(trxData)
  //     clearInterval(intervalId);
  //     resolve(receipt);
  //   }, 10 * 60 * 1000);
  //   provider.eth.sendTransaction(trxData).then((receipt) => {
  //     clearInterval(intervalId);
  //     resolve(receipt);
  //   })
  // })
}


export const mintTokens = async (token, amount, address) => {
  try {
    const contract = new provider.eth.Contract(QCHSD_ABIJSON.abi, token);
    const trx = contract.methods.mint(address, amount)
    const data = trx.encodeABI()
    console.log('data :>> ', data)
    console.log('Transaction ready to be sent')

    const receipt = await sendTransaction(token, data)
    console.log(`Transaction sent, hash is ${receipt.transactionHash}`)
    console.log(
      `mintTokens > You can see this transaction in ${process.env.DESTINATION_EXPLORER}${receipt.transactionHash}`
    )
  } catch (error) {
    console.error('Error in mintTokens >', error)
    return false
  }
}

export const transferToEthWallet = async (token, amount, address) => {
  try {
    console.log('Transfering tokens to ETH wallet 💸💸💸💸💸')
    console.log('address :>> ', address)
    console.log('amount :>> ', amount)
    const contract = new provider.eth.Contract(QCHSD_ABIJSON.abi, token);
    const trx = contract.methods.transfer(address, amount)
    const data = trx.encodeABI()
    console.log('data :>> ', data)

    console.log('Transaction ready to be sent')
    const receipt = await sendTransaction(token, data)
    console.log(`Transaction sent, hash is ${receipt.transactionHash}`)
    console.log(
      `transferToEthWallet > You can see this transaction in ${process.env.ORIGIN_EXPLORER}${receipt.transactionHash}`
    )
    return true
  } catch (error) {
    console.error('Error in transferToEthWallet >', error)
    return false
  }
}

export const approveForBurn = async (token, amount) => {
  try {
    console.log('Approving token burn 🔥🔥🔥🔥🔥')
    console.log('amount :>> ', amount)
    const contract = new provider.eth.Contract(QCHSD_ABIJSON.abi, token);
    const trx = contract.methods.approve(BRIDGE_WALLET, amount)
    const data = trx.encodeABI()
    console.log('data :>> ', data)

    console.log('Transaction ready to be sent')

    const receipt = await sendTransaction(token, data)
    console.log(`Transaction sent, hash is ${receipt.transactionHash}`)
    console.log(
      `approveForBurn > You can see this transaction in ${process.env.DESTINATION_EXPLORER}${receipt.transactionHash}`
    )
    return true
  } catch (err) {
    console.error('Error in approveForBurn > ', err)
    return false
  }
}

export const burnTokens = async (token, amount) => {
  try {
    console.log('Burning tokens from wallet 🔥🔥🔥🔥🔥')
    console.log('amount :>> ', amount)
    const contract = new provider.eth.Contract(QCHSD_ABIJSON.abi, token);
    const trx = contract.methods.burnFrom(BRIDGE_WALLET, amount)
    const data = trx.encodeABI()
    console.log('data :>> ', data)
    console.log('Transaction ready to be sent')

    const receipt = await sendTransaction(token, data)
    console.log(`Transaction sent, hash is ${receipt.transactionHash}`)
    console.log(
      `burnTokens > You can see this transaction in ${process.env.DESTINATION_EXPLORER}${receipt.transactionHash}`
    )
    return true
  } catch (err) {
    console.error('Error in burnTokens > ', err)
    return false
  }
}
