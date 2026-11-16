import React from 'react';
import katex from 'katex';

interface MathTextProps {
  text: string;
  className?: string;
}

/**
 * Renders plain prose interleaved with $$...$$ display math and $...$ inline LaTeX using KaTeX.
 */
export function MathText({ text, className = '' }: MathTextProps) {
  if (!text) return null;

  // Split by $$...$$ or $...$
  const tokens = text.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);

  return (
    <span className={className}>
      {tokens.map((token, idx) => {
        if (token.startsWith('$$') && token.endsWith('$$') && token.length > 4) {
          const math = token.slice(2, -2).trim();
          const html = katex.renderToString(math, {
            displayMode: true,
            throwOnError: false,
            strict: false,
          });
          return (
            <span
              key={idx}
              className="block my-2 overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }
        if (token.startsWith('$') && token.endsWith('$') && token.length > 2) {
          const math = token.slice(1, -1).trim();
          const html = katex.renderToString(math, {
            displayMode: false,
            throwOnError: false,
            strict: false,
          });
          return (
            <span
              key={idx}
              className="inline-block align-middle"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }
        return <React.Fragment key={idx}>{token}</React.Fragment>;
      })}
    </span>
  );
}
