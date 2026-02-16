import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

const meta: Meta<typeof Sheet> = {
  title: "Components/Sheet",
  component: Sheet,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Sheet>;

export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>Make changes to your profile here. Click save when you're done.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="sheet-name" className="text-right">
                Name
              </Label>
              <Input id="sheet-name" defaultValue="Pedro Duarte" className="col-span-3" />
            </div>
          </div>
        </SheetBody>
        <SheetFooter>
          <Button type="submit">Save changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const FastAnimation: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Fast Sheet (200ms)</Button>
      </SheetTrigger>
      <SheetContent duration={200}>
        <SheetHeader>
          <SheetTitle>Fast animation</SheetTitle>
          <SheetDescription>This sheet opens with a 200ms animation.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
};

export const Left: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Left</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Browse the application.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
};

export const Top: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Top</Button>
      </SheetTrigger>
      <SheetContent side="top">
        <SheetHeader>
          <SheetTitle>Notification</SheetTitle>
          <SheetDescription>You have 3 unread messages.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
};

export const Bottom: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Bottom</Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Cookie Preferences</SheetTitle>
          <SheetDescription>Manage your cookie settings here.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
};

export const ScrollableContent: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Scrollable Sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>You have 20 unread notifications.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className="space-y-4 py-4">
            {Array.from({ length: 20 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Static demo list never reorders
              <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
                <div className="h-2 w-2 mt-1.5 rounded-full bg-primary shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Notification {i + 1}</p>
                  <p className="text-xs text-muted-foreground">
                    This is a sample notification to demonstrate scrollable sheet content.
                  </p>
                </div>
              </div>
            ))}
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline">Mark all read</Button>
          <Button>Dismiss</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};
