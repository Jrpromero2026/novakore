/**
 * Lightweight workspace visualizations.
 *
 * Pure SVG/CSS on theme tokens — no chart dependency. Both forms are
 * single-measure by design: identity is carried by direct labels and text
 * equivalents, never by color alone, and every component handles the
 * zero-data case explicitly.
 */
import type { DayVolume } from "@/lib/data/workspace";
import type { ContentComposition } from "@/lib/data/workspace";

/**
 * Activity sparkline — real per-day event counts across the window.
 * One series, so no legend: the surrounding heading names it. The
 * accessible equivalent is a text summary plus per-day values.
 */
export function ActivitySparkline({
  data,
  label,
}: {
  data: DayVolume[];
  label: string;
}) {
  if (data.length === 0) {
    return (
      <p className="text-caption text-text-muted">No activity recorded yet.</p>
    );
  }

  const max = Math.max(...data.map((d) => d.count));
  const width = 100;
  const height = 28;

  if (max === 0) {
    return (
      <div>
        <div
          role="img"
          aria-label={`${label}: no events in the last ${data.length} days`}
          className="flex h-7 items-end"
        >
          <div className="h-px w-full bg-border-default" />
        </div>
        <p className="mt-1.5 text-caption text-text-muted">
          No events in the last {data.length} days
        </p>
      </div>
    );
  }

  // Baseline-anchored area + 2px line; recessive, no axes at this size.
  const step = width / Math.max(data.length - 1, 1);
  const points = data.map((d, i) => {
    const x = i * step;
    const y = height - (d.count / max) * (height - 3) - 1.5;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = `M ${points.join(" L ")}`;
  const area = `${line} L ${width},${height} L 0,${height} Z`;
  const busiest = data.reduce((a, b) => (b.count > a.count ? b : a));

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-7 w-full"
        role="img"
        aria-label={`${label}: ${data.reduce((s, d) => s + d.count, 0)} events across ${data.length} days, peaking at ${busiest.count} on ${busiest.day}`}
      >
        <path d={area} fill="var(--accent)" fillOpacity="0.12" />
        <path
          d={line}
          pathLength={1}
          className="nk-draw"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/*
        Text equivalent for assistive tech and print.

        The sr-only class must sit on a WRAPPER, not on the table. sr-only
        pins width to 1px, but under automatic table layout a width is only a
        minimum — the table grows to fit its content regardless, so it stayed
        353px wide and pushed a horizontal scrollbar onto every page carrying
        a sparkline at phone width. A div honours the width and clips it.
      */}
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Events</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day}>
                <th scope="row">{d.day}</th>
                <td>{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Publishing composition — a single stacked bar with directly labeled
 * segments. Segments are separated by a 2px surface gap so adjacent fills
 * never read as one mark.
 */
export function CompositionBar({
  composition,
}: {
  composition: ContentComposition;
}) {
  const { published, draft, other, total } = composition;

  if (total === 0) {
    return (
      <p className="text-body-sm text-text-muted">
        No courses yet — published and draft counts appear here once content
        exists.
      </p>
    );
  }

  const segments = [
    {
      key: "published",
      label: "Published",
      value: published,
      fill: "var(--accent)",
    },
    {
      key: "draft",
      label: "Draft",
      value: draft,
      fill: "var(--border-strong)",
    },
    {
      key: "other",
      label: "Other",
      value: other,
      fill: "var(--border-default)",
    },
  ].filter((s) => s.value > 0);

  return (
    <div>
      <div
        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={`${total} courses: ${segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(", ")}`}
      >
        {segments.map((segment) => (
          <div
            key={segment.key}
            style={{
              width: `${(segment.value / total) * 100}%`,
              background: segment.fill,
            }}
            className="h-full first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((segment) => (
          <li
            key={segment.key}
            className="flex items-center gap-1.5 text-caption text-text-secondary"
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: segment.fill }}
            />
            {segment.label}
            <span className="font-medium tabular-nums text-text-primary">
              {segment.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
