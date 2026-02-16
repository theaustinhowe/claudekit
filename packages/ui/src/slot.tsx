import * as React from "react";

function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]): React.RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (typeof ref === "function") {
        ref(value);
      } else if (ref != null) {
        (ref as React.MutableRefObject<T | null>).current = value;
      }
    }
  };
}

interface SlotProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
}

const Slot = React.forwardRef<HTMLElement, SlotProps>(({ children, ...props }, ref) => {
  if (!React.isValidElement(children)) {
    return null;
  }

  const childRef = (children as React.RefAttributes<HTMLElement>).ref;

  return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
    ...props,
    ...(children.props as Record<string, unknown>),
    ref: mergeRefs(ref, childRef as React.Ref<HTMLElement>),
    className: mergeClassNames(
      props.className,
      (children.props as Record<string, unknown>).className as string | undefined,
    ),
  });
});
Slot.displayName = "Slot";

function mergeClassNames(...classNames: (string | undefined)[]) {
  return classNames.filter(Boolean).join(" ");
}

export { Slot };
