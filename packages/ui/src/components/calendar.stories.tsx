import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "./calendar";

const meta: Meta<typeof Calendar> = {
  title: "Components/Calendar",
  component: Calendar,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Calendar>;

export const Default: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-md border" />;
  },
};

export const WithSelectedDate: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>(new Date(2026, 0, 15));
    return <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-md border" />;
  },
};

export const DateRangeStory: Story = {
  name: "DateRange",
  render: () => {
    const [range, setRange] = useState<DateRange | undefined>({
      from: new Date(2026, 1, 10),
      to: new Date(2026, 1, 17),
    });
    return <Calendar mode="range" selected={range} onSelect={setRange} className="rounded-md border" />;
  },
};

export const DisabledDates: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return (
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        disabled={[{ dayOfWeek: [0, 6] }]}
        className="rounded-md border"
      />
    );
  },
};
