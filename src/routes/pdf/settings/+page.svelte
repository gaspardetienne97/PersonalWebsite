<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import VoiceSettings from "../_components/VoiceSettings.svelte";
  import "../narrator.css";
</script>

<svelte:head>
  <title>{m.narrator_settings_head_title()}</title>
</svelte:head>

<div class="narrator min-h-screen">
  <VoiceSettings />
</div>
