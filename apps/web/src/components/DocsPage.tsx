import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { docsSections } from "../lib/docsContent";
import { parseMarkdownBlocks } from "../lib/docsMarkdown";

export function DocsPage({ onBack }: { onBack: () => void }) {
  return (
    <main className="docs-shell">
      <header className="docs-header">
        <button type="button" onClick={onBack}>
          <ArrowLeft size={16} />
          Back to editor
        </button>
        <div>
          <h1>PixelAid Docs</h1>
          <p>Editor controls, modes, and first-milestone behavior.</p>
        </div>
      </header>
      <div className="docs-layout">
        <nav className="docs-nav" aria-label="Documentation sections">
          {docsSections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.title}
            </a>
          ))}
        </nav>
        <article className="docs-content">
          {docsSections.map((section) => (
            <section key={section.id} id={section.id}>
              <MarkdownBlock markdown={section.markdown} />
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}

function MarkdownBlock({ markdown }: { markdown: string }) {
  return <>{parseMarkdownBlocks(markdown).map(renderMarkdownBlock)}</>;
}

function renderMarkdownBlock(block: ReturnType<typeof parseMarkdownBlocks>[number], index: number): ReactNode {
  const key = `${block.type}-${index}`;
  if (block.type === "heading") {
    if (block.level === 2) {
      return <h2 key={key}>{block.text}</h2>;
    }
    if (block.level === 3) {
      return <h3 key={key}>{block.text}</h3>;
    }
    return <h4 key={key}>{block.text}</h4>;
  }
  if (block.type === "list") {
    return (
      <ul key={key}>
        {block.items.map((item, itemIndex) => (
          <li key={`${item}-${itemIndex}`}>{item}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "code") {
    return (
      <pre key={key}>
        <code>{block.text}</code>
      </pre>
    );
  }
  if (block.type === "table") {
    return (
      <div key={key} className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              {block.headers.map((header, headerIndex) => (
                <th key={`${header}-${headerIndex}`}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {block.headers.map((_, cellIndex) => (
                  <td key={`cell-${rowIndex}-${cellIndex}`}>{row[cellIndex] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return <p key={key}>{block.text}</p>;
}
