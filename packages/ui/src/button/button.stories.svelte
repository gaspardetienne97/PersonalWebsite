<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import { Button } from "./index";

  const { Story } = defineMeta({
    title: "UI/Button",
    component: Button,
  });
</script>

<Story name="Default">
  <Button>Practice now</Button>
</Story>

<Story name="Secondary">
  <Button variant="secondary">Open PDF</Button>
</Story>
