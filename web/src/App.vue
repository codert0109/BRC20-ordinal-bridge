<script lang="ts">
// This starter template is using Vue 3 <script setup> SFCs
// Check out https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup
import { defineComponent } from 'vue'
import NavBar from '@/components/Navbar.vue'
import Nav from '@/components/Nav.vue'

export default defineComponent({
  setup() {
    return {}
  },
  components: { NavBar, Nav },
})
</script>

<template>
  <div class="flex flex-col h-screen justify-between">
    <Nav />
    <router-view class="container max-w-8xl mx-auto mb-auto px-4" />
  </div>
</template>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
}
</style>
