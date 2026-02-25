import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { JsonEditor } from "./json-editor";

const meta: Meta<typeof JsonEditor> = {
  title: "Components/JsonEditor",
  component: JsonEditor,
  tags: ["autodocs"],
};
export default meta;

interface PlaygroundArgs {
  placeholder: string;
  readOnly: boolean;
}

export const Playground: StoryObj<PlaygroundArgs> = {
  argTypes: {
    placeholder: { control: "text" },
    readOnly: { control: "boolean" },
  },
  args: {
    placeholder: "Paste or type JSON...",
    readOnly: false,
  },
  render: (args) => {
    const [value, setValue] = useState('{"name": "Claude", "version": 4}');
    return (
      <div className="w-lg">
        <JsonEditor
          value={value}
          onChange={setValue}
          placeholder={args.placeholder}
          readOnly={args.readOnly}
          className="space-y-1"
        />
      </div>
    );
  },
};

export const ComplexNested: StoryObj = {
  render: () => {
    const complex = JSON.stringify(
      {
        database: "duckdb",
        tables: [
          { name: "users", columns: ["id", "name", "email"] },
          { name: "sessions", columns: ["id", "user_id", "started_at"] },
        ],
        config: {
          threads: 4,
          memory_limit: "2GB",
          extensions: ["json", "parquet"],
        },
      },
      null,
      2,
    );
    const [value, setValue] = useState(complex);
    return (
      <div className="w-lg">
        <JsonEditor value={value} onChange={setValue} className="space-y-1" />
      </div>
    );
  },
};

export const Empty: StoryObj = {
  render: () => {
    const [value, setValue] = useState("");
    return (
      <div className="w-lg">
        <JsonEditor value={value} onChange={setValue} className="space-y-1" />
      </div>
    );
  },
};

export const InvalidJson: StoryObj = {
  render: () => {
    const [value, setValue] = useState('{"broken": true,}');
    return (
      <div className="w-lg">
        <JsonEditor value={value} onChange={setValue} className="space-y-1" />
      </div>
    );
  },
};

export const MinifiedJson: StoryObj = {
  render: () => {
    const [value, setValue] = useState('{"users":[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}],"total":2}');
    return (
      <div className="w-lg">
        <JsonEditor value={value} onChange={setValue} className="space-y-1" />
      </div>
    );
  },
};

export const ReadOnly: StoryObj = {
  render: () => (
    <div className="w-lg">
      <JsonEditor value='{"readOnly": true, "editable": false}' onChange={() => {}} readOnly className="space-y-1" />
    </div>
  ),
};

export const ValidJson: StoryObj = {
  render: () => {
    const [value, setValue] = useState('{"status": "ok", "count": 42}');
    return (
      <div className="w-lg">
        <JsonEditor value={value} onChange={setValue} className="space-y-1" />
      </div>
    );
  },
};
