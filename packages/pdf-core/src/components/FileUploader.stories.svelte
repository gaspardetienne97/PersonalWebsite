<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import FileUploader from "./FileUploader.svelte";

  const { Story } = defineMeta({
    title: "PDF/FileUploader",
    component: FileUploader,
  });
</script>

<Story name="Default" />
