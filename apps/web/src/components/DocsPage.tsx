import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { docsSections } from "../lib/docsContent";

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
  const lines = markdown.trim().split("\n");
  const elements: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }

    elements.push(
      <ul key={`list-${elements.length}`}>
        {listItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  for (const line of lines) {
    if (line.startsWith("# ")) {
      flushList();
      elements.push(<h2 key={line}>{line.slice(2)}</h2>);
    } else if (line.startsWith("- ")) {
      listItems.push(line.slice(2));
    } else if (line.trim().length === 0) {
      flushList();
    } else {
      flushList();
      elements.push(<p key={`${line}-${elements.length}`}>{line}</p>);
    }
  }
  flushList();

  return <>{elements}</>;
}
