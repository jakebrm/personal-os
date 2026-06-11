'use client';
import { useEffect, useRef, useState } from 'react';
import type { TrainingWorkout } from './useTrainingData';
import {
  sportColor, sportGlyph, sportLabel, fmtDistance, fmtDuration, fmtDayDate,
} from './useTrainingData';

export function WorkoutDetail({
  workout, onClose, onToggle, onSaveNotes,
}: {
  workout: TrainingWorkout;
  onClose: () => void;
  onToggle: (id: string, completed: boolean) => void;
  onSaveNotes: (id: string, notes: string) => void;
}) {
  const color = sportColor(workout.sport);
  const [notes, setNotes] = useState(workout.notes ?? '');
  const dirty = useRef(false);

  // Reset the notes field when switching to a different workout.
  useEffect(() => {
    setNotes(workout.notes ?? '');
    dirty.current = false;
  }, [workout.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function commitNotes() {
    if (!dirty.current) return;
    dirty.current = false;
    onSaveNotes(workout.id, notes);
  }

  const dist = fmtDistance(workout.distance_meters);
  const dur  = fmtDuration(workout.duration_minutes);

  return (
    <section className="card tr-detail" style={{ '--sport': color } as React.CSSProperties}>
      <div className="tr-detail-head">
        <div className="tr-detail-titles">
          <div className="tr-detail-badge" aria-hidden>{sportGlyph(workout.sport)}</div>
          <div>
            <h2 className={`tr-detail-name${workout.completed ? ' done' : ''}`}>{workout.name}</h2>
            <div className="tr-detail-meta">
              {fmtDayDate(workout.date)}
              {workout.description && <> · {workout.description}</>}
            </div>
          </div>
        </div>
        <button className="tr-close" onClick={onClose} aria-label="Close detail">✕</button>
      </div>

      <div className="tr-detail-tags">
        <span className="tr-tag" style={{ color }}>{sportLabel(workout.sport)}</span>
        {workout.type && <span className="tr-tag">{workout.type}</span>}
        {workout.primary_zone && workout.primary_zone !== '—' && (
          <span className="tr-tag">{workout.primary_zone}</span>
        )}
        {dur  && <span className="tr-tag">{dur}</span>}
        {dist && <span className="tr-tag">{dist}</span>}
      </div>

      {workout.human_readable && (
        <pre className="tr-prescription">{workout.human_readable}</pre>
      )}

      <button
        className={`tr-complete-btn${workout.completed ? ' done' : ''}`}
        onClick={() => onToggle(workout.id, !workout.completed)}
      >
        {workout.completed ? '✓ Completed' : 'Mark Complete'}
      </button>

      <label className="tr-notes-label">
        How did it feel?
        <textarea
          className="tr-notes"
          value={notes}
          placeholder="Add a note…"
          onChange={e => { setNotes(e.target.value); dirty.current = true; }}
          onBlur={commitNotes}
        />
      </label>
    </section>
  );
}
