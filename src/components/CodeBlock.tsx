import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SyntaxHighlighter, tokenTheme } from "@/lib/highlight";

interface CodeBlockProps {
  language?: string;
  value: string;
  className?: string;
}

const CodeBlock = ({ language, value, className }: CodeBlockProps) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setIsCopied(true);
      toast.success("Code copied to clipboard");
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy code");
    }
  };

  return (
    <div className={cn("codeblock relative group overflow-hidden my-6 border", className)}>
      <div className="absolute right-4 top-12 z-10 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          onClick={handleCopy}
          className="p-2 border border-[var(--rule-2)] bg-[var(--bg-2)] text-[var(--ink-2)] hover:bg-[var(--accent)] hover:text-[var(--on-accent)] hover:border-[var(--accent)] focus-visible:bg-[var(--accent)] focus-visible:text-[var(--on-accent)] focus-visible:border-[var(--accent)]"
          aria-label="Copy code"
        >
          {isCopied ? (
            <Check className="w-4 h-4" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
      </div>
      <div className="codeblock__bar">{language || "text"}</div>
      <SyntaxHighlighter
        language={language || "text"}
        style={tokenTheme}
        PreTag="div"
        codeTagProps={{
          style: {
            backgroundColor: "transparent",
            fontFamily: "inherit",
          }
        }}
        customStyle={{
          margin: 0,
          padding: "1.5rem",
          background: "transparent",
          fontSize: "0.875rem",
          lineHeight: "1.6",
        }}
        showLineNumbers={true}
        lineNumberStyle={{
          minWidth: "2.5em",
          paddingRight: "1em",
          color: "var(--ink-3)",
          textAlign: "right",
        }}
        wrapLines={true}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
};

export default CodeBlock;
