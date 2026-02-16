import { forwardRef } from "react";

const Image = forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>(({ children, ...props }, ref) => (
  <img ref={ref} {...props} />
));
Image.displayName = "Image";

export default Image;
