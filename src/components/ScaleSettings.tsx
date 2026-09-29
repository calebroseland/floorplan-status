import { useState } from "react";
import { uid } from "../geometry";
import {
  buildScale,
  contrastText,
  DEFAULT_CLEANLINESS_SOURCE,
  DEFAULT_CONSTRUCTION_SOURCE,
  parseScale,
} from "../scales";
import type { Scale } from "../types";

interface Props {
  scales: Scale[];
  onSave: (scales: Scale[]) => void;
  onClose: () => void;
}

export function ScaleSettings({ scales, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Scale[]>(() => scales.map((s) => ({ ...s })));

  function update(id: string, patch: Partial<Scale>) {
    setDraft((current) => current.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function save() {
    onSave(draft.map((s) => ({ ...s, levels: parseScale(s.source) })));
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <h2>Status scales</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal__body">
          <p className="hint">
            One level per line, best to worst or worst to best — whatever order you want them shown
            in:
            <code>icon Label: description</code>. The colour comes from the icon (🟢 🟡 🟠 🔴 🔵 🟣
            🟤 ⚪ ⚫); repeat an icon and the later step is drawn a shade deeper. Add{" "}
            <code>#3b82f6</code> anywhere on a line to set the colour by hand.
          </p>

          {draft.map((scale) => {
            const levels = parseScale(scale.source);
            return (
              <section className="scale-editor" key={scale.id}>
                <div className="row">
                  <input
                    className="scale-editor__name"
                    value={scale.name}
                    onChange={(e) => update(scale.id, { name: e.target.value })}
                  />
                  {draft.length > 1 && (
                    <button
                      className="ghost-btn"
                      onClick={() =>
                        setDraft((current) => current.filter((s) => s.id !== scale.id))
                      }
                    >
                      Remove scale
                    </button>
                  )}
                </div>
                <textarea
                  className="scale-editor__source"
                  rows={Math.max(6, scale.source.split("\n").length + 1)}
                  value={scale.source}
                  spellCheck={false}
                  onChange={(e) => update(scale.id, { source: e.target.value })}
                />
                <div className="scale-preview">
                  {levels.map((level) => (
                    <span
                      key={level.id}
                      className="scale-preview__chip"
                      title={level.desc}
                      style={{ background: level.color, color: contrastText(level.color) }}
                    >
                      {level.icon} {level.label}
                    </span>
                  ))}
                  {levels.length === 0 && <span className="hint">No levels parsed yet.</span>}
                </div>
              </section>
            );
          })}

          <div className="row">
            <button
              className="ghost-btn"
              onClick={() =>
                setDraft((current) => [
                  ...current,
                  buildScale(
                    uid("scale"),
                    "New scale",
                    "🟢 Good: All fine.\n🟡 Watch: Keep an eye on it.\n🔴 Bad: Needs attention.",
                  ),
                ])
              }
            >
              + Add scale
            </button>
            <button
              className="ghost-btn"
              onClick={() =>
                setDraft([
                  buildScale("cleanliness", "Cleanliness", DEFAULT_CLEANLINESS_SOURCE),
                  buildScale("construction", "Construction", DEFAULT_CONSTRUCTION_SOURCE),
                ])
              }
            >
              Reset to defaults
            </button>
          </div>

          <p className="hint">
            Renaming a level keeps rooms pointed at it as long as the label stays the same — the id
            is derived from the label, so a rewritten label clears that room's status for this
            scale.
          </p>
        </div>

        <footer className="modal__foot">
          <button className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-btn" onClick={save}>
            Save scales
          </button>
        </footer>
      </div>
    </div>
  );
}
