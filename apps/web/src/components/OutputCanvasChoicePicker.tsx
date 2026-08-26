import type { OutputCanvasChoice, OutputCanvasPrediction } from "../lib/outputCanvas";

const outputCanvasChoices: Array<{
  id: OutputCanvasChoice;
  label: string;
  description: string;
}> = [
  {
    id: "composition",
    label: "Keep composition",
    description: "Match the native canvas and preserve source placement."
  },
  {
    id: "subject",
    label: "Trim to subject",
    description: "Remove transparent margins and export tight bounds."
  },
  {
    id: "custom",
    label: "Custom canvas",
    description: "Choose final dimensions, fitting, and anchor."
  }
];

export function OutputCanvasChoicePicker({
  value,
  prediction,
  onChange
}: {
  value: OutputCanvasChoice;
  prediction: OutputCanvasPrediction;
  onChange: (choice: OutputCanvasChoice) => void;
}) {
  return (
    <>
      <div className="output-choice-grid" role="radiogroup" aria-label="Output canvas behavior">
        {outputCanvasChoices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            role="radio"
            aria-checked={value === choice.id}
            className={value === choice.id ? "active" : ""}
            onClick={() => onChange(choice.id)}
          >
            <strong>{choice.label}</strong>
            <small>{choice.description}</small>
          </button>
        ))}
      </div>
      <div className="output-prediction" role="status" aria-live="polite">
        <span>Expected output</span>
        <strong>{prediction.size}</strong>
        <small>{prediction.detail}</small>
      </div>
    </>
  );
}
