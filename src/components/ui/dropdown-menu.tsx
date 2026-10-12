"use client";
import * as Menu from "@radix-ui/react-dropdown-menu";
export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export function DropdownMenuContent({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Menu.Portal>
      <Menu.Content className="dropdown-content" sideOffset={6} align="end">
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}
export function DropdownMenuItem(
  props: React.ComponentProps<typeof Menu.Item>,
) {
  return (
    <Menu.Item
      {...props}
      className={`dropdown-item ${props.className ?? ""}`}
    />
  );
}
export function DropdownMenuSeparator() {
  return <Menu.Separator className="dropdown-separator" />;
}
