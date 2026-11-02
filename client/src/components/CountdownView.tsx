import { useEffect, useState } from "react";
import { countdownTarget, timeLeft, type Countdown } from "../../../shared/countdown.ts";

interface Props {
  cd: Countdown;
  onSetDate(date: string): void;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A live timer: days, hours, minutes and seconds to go, ticking every second. */
export function CountdownView({ cd, onSetDate }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [editing, setEditing] = useState(false);
  const target = countdownTarget(cd, now);
  const ticking = !!target;

  useEffect(() => {
    if (!ticking) return;
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, [ticking]);

  const allDay = cd.at === null && !cd.time;
  const left = target ? timeLeft(target, now, allDay) : null;
  const when =
    target &&
    target.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) +
      (allDay ? "" : " · " + target.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));
  const askForDate = cd.status === "not-found" || editing;

  return (
    <div className="countdown">
      <strong className="cd-label">{cd.label}</strong>

      {cd.status === "looking" && <p className="cd-state">looking up the date…</p>}

      {left?.state === "future" && (
        <div className="cd-clock" role="timer" aria-label={`${left.days} days ${left.hours} hours ${left.minutes} minutes to go`}>
          {[
            [left.days, "days"],
            [pad(left.hours), "hrs"],
            [pad(left.minutes), "min"],
            [pad(left.seconds), "sec"],
          ].map(([v, unit]) => (
            <span key={unit}>
              <b>{v}</b>
              <small>{unit}</small>
            </span>
          ))}
        </div>
      )}
      {left?.state === "today" && <p className="cd-big">TODAY</p>}
      {left?.state === "past" && (
        <p className="cd-big past">{left.days === 0 ? (allDay ? "TODAY" : "STARTED") : `${left.days} DAY${left.days === 1 ? "" : "S"} AGO`}</p>
      )}

      {when && <p className="cd-when">{when}</p>}

      {askForDate && (
        <form
          className="cd-date"
          onSubmit={(e) => {
            e.preventDefault();
            const value = new FormData(e.currentTarget).get("date");
            if (typeof value === "string" && value) {
              onSetDate(value);
              setEditing(false);
            }
          }}
        >
          <label htmlFor={`cd-${cd.label}`}>{cd.status === "not-found" ? "couldn't find a date — set it:" : "new date:"}</label>
          <span>
            <input id={`cd-${cd.label}`} name="date" type="date" required defaultValue={cd.date ?? ""} />
            <button type="submit">SET</button>
          </span>
        </form>
      )}

      {cd.status === "found" && (
        <p className="cd-source">
          {cd.url ? (
            <a href={cd.url} target="_blank" rel="noreferrer">
              {cd.source ?? "source"}
            </a>
          ) : (
            cd.source
          )}
          {cd.yearly && " · every year"}
          {" · "}
          <button type="button" className="cd-edit" onClick={() => setEditing((v) => !v)}>
            {editing ? "cancel" : "change date"}
          </button>
        </p>
      )}
    </div>
  );
}
