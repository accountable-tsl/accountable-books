import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type SkeletonBlockProps = {
  width?: number | string; // Optional, defaults to full
  height?: number | string; // Optional, for the top block
  lines?: number; // Number of text skeleton lines
  blocks?: number;
  spacing?: number; // Space between lines in px
  radius?: string; // Tailwind radius token: 'sm', 'md', 'lg', 'xl', '2xl'
  autoSplit?: boolean;
  layout?: "vertical" | "horizontal" | "grid" | "auto";
  className?: string;
};

export function SkeletonBlock({
  width = "100%",
  height = 250,
  lines,
  blocks,
  spacing = 8,
  radius = "xl",
  autoSplit = true,
  layout = "vertical",
  className,
}: SkeletonBlockProps) {
  const numericHeight =
    typeof height === "string" && height.endsWith("px")
      ? parseInt(height)
      : typeof height === "number"
      ? height
      : 250;

  const numericWidth =
    typeof width === "string" && width.endsWith("px")
      ? parseInt(width)
      : typeof width === "number"
      ? width
      : 250;

  const lineHeight = 16;
  const lineSpacing = spacing;
  const blockMinSize = 100;

  const autoLayout =
    layout === "auto"
      ? numericWidth > numericHeight
        ? "horizontal"
        : numericHeight > numericWidth * 1.2
        ? "vertical"
        : "grid"
      : layout;

  const maxBlocks =
    autoLayout === "grid"
      ? 4
      : Math.max(
          1,
          Math.floor(
            (autoLayout === "horizontal" ? numericWidth : numericHeight) /
              blockMinSize
          )
        );

  const finalBlockCount = blocks ?? (autoSplit ? maxBlocks : 1);

  const availableMainSize =
    autoLayout === "horizontal" ? numericWidth : numericHeight;
  const availablePerBlock = availableMainSize / finalBlockCount;

  const finalLineCount =
    lines ??
    Math.max(
      1,
      Math.floor((availablePerBlock - 60) / (lineHeight + lineSpacing))
    );

  const renderTextLines = (blockIdx: number) => (
    <div className="flex flex-col" style={{ gap: lineSpacing }}>
      {Array.from({ length: finalLineCount }).map((_, idx) => {
        const width = idx === finalLineCount - 1 ? "60%" : "100%";
        return (
          <Skeleton
            key={`${blockIdx}-${idx}`}
            className="h-4"
            style={{ width }}
          />
        );
      })}
    </div>
  );

  const getBlock = (idx: number) => (
    <div
      key={idx}
      className="flex flex-col"
      style={{
        gap: spacing,
        height: autoLayout === "horizontal" ? "100%" : availablePerBlock,
        width: autoLayout === "horizontal" ? availablePerBlock : "100%",
      }}
    >
      <Skeleton
        className={cn(`rounded-${radius}`)}
        style={{
          height:
            availablePerBlock - finalLineCount * (lineHeight + lineSpacing),
          width: "100%",
        }}
      />
      {renderTextLines(idx)}
    </div>
  );

  return (
    <div
      className={cn(
        className,
        autoLayout === "horizontal" && "flex flex-row gap-4",
        autoLayout === "vertical" && "flex flex-col gap-4",
        autoLayout === "grid" && "grid gap-4 grid-cols-2"
      )}
      style={{
        width,
        height,
        overflow: "hidden",
      }}
    >
      {Array.from({ length: finalBlockCount }).map((_, i) => getBlock(i))}
    </div>
  );
}
