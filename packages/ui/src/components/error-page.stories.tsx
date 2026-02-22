import type { Meta, StoryObj } from "@storybook/react";
import { ErrorPage } from "./error-page";

const meta: Meta<typeof ErrorPage> = {
  title: "Components/ErrorPage",
  component: ErrorPage,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
};
export default meta;

interface PlaygroundArgs {
  errorMessage: string;
}

export const Playground: StoryObj<PlaygroundArgs> = {
  argTypes: {
    errorMessage: { control: "text" },
  },
  args: {
    errorMessage: "An unexpected error occurred",
  },
  render: (args) => <ErrorPage error={new Error(args.errorMessage)} reset={() => {}} />,
};

export const WithLongMessage: StoryObj<typeof ErrorPage> = {
  render: () => (
    <ErrorPage
      error={
        new Error(
          "Failed to fetch data from the API. The server returned a 500 Internal Server Error. Please check your network connection and try again later.",
        )
      }
      reset={() => {}}
    />
  ),
};
