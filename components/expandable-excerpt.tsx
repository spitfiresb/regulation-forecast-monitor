"use client";
import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { displayText } from "@/lib/display-text";

export function ExpandableExcerpt({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const content = displayText(text);
  const long = content.length > 420;
  const cut = content.lastIndexOf(" ", 420);
  const preview = long ? content.slice(0, cut > 0 ? cut : 420) : content;
  return (
    <div className="expandable-excerpt">
      <p id={id}>{expanded || !long ? content : `${preview}…`}</p>
      {long && (
        <button
          type="button"
          className="excerpt-toggle"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : "Read full listing"}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
