import Root from "./dropdown-menu.svelte";
import Sub from "./dropdown-menu-sub.svelte";
import CheckboxGroup from "./dropdown-menu-checkbox-group.svelte";
import CheckboxItem from "./dropdown-menu-checkbox-item.svelte";
import Content from "./dropdown-menu-content.svelte";
import Group from "./dropdown-menu-group.svelte";
import Item from "./dropdown-menu-item.svelte";
import Label from "./dropdown-menu-label.svelte";
import RadioGroup from "./dropdown-menu-radio-group.svelte";
import RadioItem from "./dropdown-menu-radio-item.svelte";
import Separator from "./dropdown-menu-separator.svelte";
import Shortcut from "./dropdown-menu-shortcut.svelte";
import Trigger from "./dropdown-menu-trigger.svelte";
import SubContent from "./dropdown-menu-sub-content.svelte";
import SubTrigger from "./dropdown-menu-sub-trigger.svelte";
import GroupHeading from "./dropdown-menu-group-heading.svelte";
import Portal from "./dropdown-menu-portal.svelte";
import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";

// Two unstyled bits-ui parts, for a caller that draws its own panel or its own radio rows.
// Take them from here, never from "bits-ui" in the app: the app and this package each
// resolve their own copy of bits-ui, and in a production build parts from two copies
// cannot find each other's menu context ("Context Menu.Root | Menu.Sub not found").
const ContentStatic = DropdownMenuPrimitive.ContentStatic;
const PlainRadioItem = DropdownMenuPrimitive.RadioItem;

export {
  CheckboxGroup,
  CheckboxItem,
  Content,
  ContentStatic,
  PlainRadioItem,
  Portal,
  Root as DropdownMenu,
  CheckboxGroup as DropdownMenuCheckboxGroup,
  CheckboxItem as DropdownMenuCheckboxItem,
  Content as DropdownMenuContent,
  Portal as DropdownMenuPortal,
  Group as DropdownMenuGroup,
  Item as DropdownMenuItem,
  Label as DropdownMenuLabel,
  RadioGroup as DropdownMenuRadioGroup,
  RadioItem as DropdownMenuRadioItem,
  Separator as DropdownMenuSeparator,
  Shortcut as DropdownMenuShortcut,
  Sub as DropdownMenuSub,
  SubContent as DropdownMenuSubContent,
  SubTrigger as DropdownMenuSubTrigger,
  Trigger as DropdownMenuTrigger,
  GroupHeading as DropdownMenuGroupHeading,
  Group,
  GroupHeading,
  Item,
  Label,
  RadioGroup,
  RadioItem,
  Root,
  Separator,
  Shortcut,
  Sub,
  SubContent,
  SubTrigger,
  Trigger,
};
