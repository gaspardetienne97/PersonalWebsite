<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import * as Card from "./index";

  const { Story } = defineMeta({
    title: "UI/Card",
  });
</script>

<Story name="Route App Card">
  <Card.Root class="max-w-md">
    <Card.Header>
      <Card.Title>Daily practice</Card.Title>
      <Card.Description>Shared card styling for route apps.</Card.Description>
    </Card.Header>
    <Card.Content>
      <p class="text-sm text-muted-foreground">Uses the site theme tokens.</p>
    </Card.Content>
  </Card.Root>
</Story>
