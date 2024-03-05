<template>
  <div class="text-center pt-12">
    <h1 class="text-2xl font-bold mb-8">
      Bridge from {{ originNetwork }} to {{ destinationNetwork }}
    </h1>
    <p>
      This bridge allows you to send BRC-20 tokens from {{ originNetwork }} to {{ destinationNetwork }}.
    </p>
    <p>
      You'll be given your address to send selected ticker.
    </p>
    <p>Once you've finished sending to the address in your wallet, same amount of wrapped tokens will be minted on your {{
      destinationNetwork }} wallet
      connected.</p>

    <div style="margin-top: 100px;"></div>
    <WalletConnect class="my-4" :targetNetwork="originNetwork" :targetNetworkId="originNetworkId" :currency="ETH"
      :decimals="18" />
    <div v-if="walletStore.signature">
      <div style="margin-top: 20px;" v-if="walletStore.btcReceivingAddress != ''">
        This is your exclusive receving address: <b> {{ walletStore.btcReceivingAddress }}</b>
        <p>Note: All assets sent to this address will be regarded as bridge requests from you. </p>
      </div>
      <div style="margin-top: 20px;" v-if="walletStore.pendingRequests.length">
        You have {{ walletStore.pendingRequests.length }} pending requests:
        <div v-for="req in walletStore.pendingRequests">
          Send <b> {{ req.amount }} </b> <b> {{ req.ticker }}</b>
        </div>
      </div>
      <button style="margin-top: 20px;" v-else type="button" @click="checkReceivingAddress"
        v-if="walletStore.btcReceivingAddress == ''"
        class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500">
        Check my receive address and pending requests
      </button>
    </div>
    <form class="w-96 mt-8 mx-auto">
      <label for="price" class="block mb-2 font-medium text-gray-700" style="margin-top:  100px;">What BRC-20 ticker do
        you want to bridge?</label>
      <div class="mt-4 w-2/3 mx-auto relative rounded-md shadow-sm">
        <input type="text" v-model="ticker" name="ticker" id="ticker"
          class="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-7 sm:text-sm border-gray-300 rounded-md"
          aria-describedby="ticker-currency" />
      </div>
      <label style="margin-top: 20px;" for="price" class="block mb-2 font-medium text-gray-700">How many do you want to bridge?</label>
      <div class="mt-4 w-2/3 mx-auto relative rounded-md shadow-sm">
        <input type="number" v-model="amount" name="price" id="price"
          class="focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
          placeholder="0.00" aria-describedby="price-currency" />
      </div>
      <button type="button"
        class="inline-flex items-center px-4 py-2 mt-4 border border-transparent shadow-sm text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        @click="sendTokens">
        <svg xmlns="http://www.w3.org/2000/svg" class="m-ml-1 mr-3 h-6 w-6" fill="none" viewBox="0 0 24 24"
          stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        {{
          trxInProgress ? `Processing...` : `Bridge to ${destinationNetwork}`
        }}
      </button>
    </form>
    <p v-if="bridgedOk" class="px-4 py-2 bg-blue-100 text-blue-600 border border-blue-600 rounded-lg w-2/5 mx-auto my-8">
      Tokens sent to {{ destinationNetwork }}
    </p>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue'
import { ethers, BigNumber } from 'ethers'

import { useWalletStore } from '../stores/wallet'
import WalletConnect from '@/components/WalletConnect.vue'

import axios from "axios";

export default defineComponent({
  components: { WalletConnect },
  setup() {
    const trxInProgress = ref<boolean>(false)
    const bridgedOk = ref<boolean>(false)

    const walletStore = useWalletStore()
    const amount = ref<number>(0)
    const ticker = ref<String>('')

    const originNetwork = import.meta.env.VITE_ORIGIN_NETWORK_NAME
    const originNetworkId = import.meta.env.VITE_ORIGIN_NETWORK_ID
    const destinationNetwork = import.meta.env.VITE_DESTINATION_NETWORK_NAME

    // get the account that will pay for the trasaction
    const checkReceivingAddress = async function () {
      if (typeof window.ethereum !== 'undefined') {
        try {
          const { data: { address, pendingRequests } } = await axios.post(import.meta.env.VITE_BACKEND_API + '/receive_address', {}, { withCredentials: true })
          trxInProgress.value = false
          walletStore.saveBtcAddress(address);
          walletStore.savePendingRequests(pendingRequests)
        } catch (error: any) {
          console.log({ error })
          alert(error?.response?.data?.messsage)
          trxInProgress.value = false
        }
      }
    }

    const sendTokens = async function () {
      const amountFormatted = ethers.parseUnits(String(amount.value), 18)
      console.log('amountFormatted :>> ', amountFormatted)
      console.log('amountFormatted.toString() :>> ', amountFormatted.toString())

      if (typeof window.ethereum !== 'undefined') {
        trxInProgress.value = true
        try {
          const { data: { address, pendingRequests } } = await axios.post(import.meta.env.VITE_BACKEND_API + '/request_brc_to_erc', {
            ticker: ticker.value,
            amount: amount.value,
          }, { withCredentials: true })
          trxInProgress.value = false
          walletStore.saveBtcAddress(address);
          walletStore.savePendingRequests(pendingRequests)
        } catch (error: any) {
          console.log({ error })
          alert("You already sent the bridge request for this asset")
          trxInProgress.value = false
          walletStore.saveBtcAddress(error?.response?.data?.toAddress);
        }


      }
    }


    return {
      walletStore,
      trxInProgress,
      amount,
      sendTokens,
      originNetwork,
      originNetworkId,
      destinationNetwork,
      bridgedOk,
      ticker,
      checkReceivingAddress,
    }
  },

  mounted() {
  },

  computed: {
    accAvailable() {
      return useWalletStore().address
    },
  },
})
</script>
