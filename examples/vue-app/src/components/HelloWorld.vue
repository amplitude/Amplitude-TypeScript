<template>
  <div class="hello">
    <h1>{{ msg }}</h1>
    <button @click="handleIdentifyClick">
      Identify
    </button>

    <button @click="handleGroupClick">
      Group
    </button>

    <button @click="handleGroupIdentify">
      Group Identify
    </button>

    <button @click="handleTrackClick">
      Track
    </button>
  </div>
</template>

<script lang="ts">
import { Options, Vue } from 'vue-class-component';
import { track, identify, setGroup, groupIdentify, Identify } from '@amplitude/analytics-browser';

@Options({
  props: {
    msg: String
  },
  methods: {
    handleIdentifyClick() {
      identify(new Identify().set('role', 'engineer'))
    },
    handleGroupClick() {
      setGroup('org', 'engineering')
    },
    handleGroupIdentify() {
      groupIdentify('org', 'engineering', new Identify().set('technology', 'react.js'))
    },
    handleTrackClick() {
      track('Button Click', { name: 'App' })
    },
  },
})
export default class HelloWorld extends Vue {
  msg!: string
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
h3 {
  margin: 40px 0 0;
}
ul {
  list-style-type: none;
  padding: 0;
}
li {
  display: inline-block;
  margin: 0 10px;
}
a {
  color: #42b983;
}
</style>
