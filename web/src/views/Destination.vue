<template>
  <div class="text-center pt-12">
    <h1 class="text-2xl font-bold mb-8">
      Bridge from {{ destinationNetwork }} to {{ originNetwork }}
    </h1>

    <p>
      This bridge allows you to send wrapped BRC20 tokens from {{ destinationNetwork }} back to {{ originNetwork }}
    </p>

    <div style="margin-top: 100px;"></div>
    <WalletConnect class="my-4" :targetNetwork="destinationNetwork" :targetNetworkId="destinationNetworkId"
      :currency="'ETH'" :decimals="18" :isNewNetwork="true" />

    <form class="w-96 mt-8 mx-auto">
      <label for="price" class="block mb-2 font-medium text-gray-700" style="margin-top:  100px;">Give your bitcoin
        address to receive BRCs back</label>
      <input type="text" name="btcaddress" style="margin-top: 20px;" v-model="btcAddress"
        class="focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
        placeholder="bc1..." aria-describedby="price-currency" />

      <label for="price" class="block mb-2 font-medium text-gray-700" style="margin-top:  100px;">What BRC-20 token do
        you want to bridge back?</label>
      <div class="mt-4 w-2/3 mx-auto relative rounded-md shadow-sm">
        <input type="text" v-model="tokenAddress" name="token" id="token"
          class="focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
          aria-describedby="token-currency" placeholder="0x123A..." />
      </div>
      <label for="price" class="block mb-2 font-medium text-gray-700">How many tokens do you want to bridge back?</label>
      <div class="mt-4 w-2/3 mx-auto relative rounded-md shadow-sm">
        <input type="number" v-model="amount" name="price" id="price"
          class="focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
          placeholder="0.00" aria-describedby="price-currency" />
      </div>
      <p class="text-xs mt-1">Your balance is: {{ walletBalance }}</p>

      <button type="button"
        class="inline-flex items-center px-4 py-2 mt-4 border border-transparent shadow-sm text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        @click="sendTokens">
        <svg xmlns="http://www.w3.org/2000/svg" class="m-ml-1 mr-3 h-6 w-6" fill="none" viewBox="0 0 24 24"
          stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        {{ trxInProgress ? `Processing...` : `Bridge to ${originNetwork}` }}
      </button>
    </form>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue'
import { ethers, BigNumber } from 'ethers'
import axios from 'axios'

import { useWalletStore } from '../stores/wallet'
import WalletConnect from '@/components/WalletConnect.vue'

import DChainstackDollars from '@/artifacts/contracts/DestinationToken.sol/DChainstackDollars.json'
import ChainstackDollars from '@/artifacts/contracts/OriginToken.sol/ChainstackDollars.json'

export default defineComponent({
  components: { WalletConnect },
  setup() {
    const trxInProgress = ref<boolean>(false)

    const walletStore = useWalletStore()
    const btcAddress = ref<string>('')
    const amount = ref<number>(0)
    const walletBalance = ref<Number>(0)
    const tokenAddress = ref<string>('')

    const originNetwork = import.meta.env.VITE_ORIGIN_NETWORK_NAME
    const destinationNetwork = import.meta.env.VITE_DESTINATION_NETWORK_NAME
    const destinationNetworkId = import.meta.env.VITE_DESTINATION_NETWORK_ID

    const bridgeWallet = import.meta.env.VITE_BRIDGE_WALLET

    const provider = new ethers.BrowserProvider(window.ethereum)
    // get the account that will pay for the trasaction

    const checkBalance = async function () {
      // if (walletStore.address) {
      try {
        console.log('checking balane')
        console.log('walletStore.address :>> ', walletStore.address)
        const signer = await provider.getSigner()
        let contract = new ethers.Contract(
          tokenAddress.value,
          DChainstackDollars.abi,
          signer
        )
        // let balance = await provider.getBalance(destinationTokenAddress);
        let balance = await contract.balanceOf(walletStore.address)
        balance = ethers.formatUnits(balance, 18)
        console.log('balance :>> ', balance)
        walletBalance.value = balance
      } catch (error) {
        console.error('Error checking balance', error)
      }
      // }
    }


    const sendTokens = async function () {
      const amountFormatted = ethers.parseUnits(String(amount.value), 18)
      console.log('amountFormatted :>> ', amountFormatted)
      console.log('amountFormatted.toString() :>> ', amountFormatted.toString())

      //@ts-expect-error Window.ethers not TS
      if (typeof window.ethereum !== 'undefined') {
        trxInProgress.value = true
        //@ts-expect-error Window.ethers not TS
        // const provider = new ethers.providers.Web3Provider(window.ethereum)
        // get the account that will pay for the trasaction
        // const signer = provider.getSigner()
        // as the operation we're going to do is a transaction,
        // we pass the signer instead of the provider
        // const contract = new ethers.Contract(
        //   contractAddress,
        //   ChainstackDollars.abi,
        //   signer
        // )
        const signer = await provider.getSigner()


        let contract = new ethers.Contract(
          tokenAddress.value,
          DChainstackDollars.abi,
          signer
        )

        try {
          await axios.post(import.meta.env.VITE_BACKEND_API + '/request_erc_to_brc', {
            tokenAddress: tokenAddress.value,
            btcAddress: btcAddress.value
          }, { withCredentials: true })
          try {
            const transaction = await contract.transfer(
              bridgeWallet,
              amountFormatted.toString()
            )

            console.log('transaction :>> ', transaction)
            // wait for the transaction to actually settle in the blockchain
            await transaction.wait()
            amount.value = 0
            trxInProgress.value = false
          } catch (error) {
            console.error(error)
            trxInProgress.value = false
          }
        } catch (error: any) {
          console.log({ error })
          if (error.response) alert(error?.response?.data?.message)
          trxInProgress.value = false
        }

      }
    }

    return {
      walletStore,
      trxInProgress,
      amount,
      walletBalance,
      sendTokens,
      checkBalance,
      originNetwork,
      destinationNetworkId,
      destinationNetwork,
      btcAddress,
      tokenAddress
    }
  },

  mounted() {
  },

  computed: {
    accAvailable() {
      return useWalletStore().address
    },
  },
  watch: {
    async accAvailable(newVal, old) {
      console.log(`updating from ${old} to ${newVal}`)
      await this.checkBalance()
    },
  },
})
</script>
