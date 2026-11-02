import { QuartzTransformerPlugin } from "../types"

/**
 * Timeline transformer
 *
 * Renders code blocks written for the Obsidian "Timeline" community plugin:
 *
 *   ```timeline
 *   [line-3, body-2]          <- optional style classes (passed through as CSS classes)
 *   + June, 1975              <- date
 *   + Title of the event      <- title (can contain [[wikilinks]] and markdown)
 *   + Longer description...   <- body  (can contain [[wikilinks]] and markdown)
 *
 *   + March, 1982
 *   ...
 *   ```
 *
 * The block is rewritten into HTML wrappers *before* Markdown parsing, with the title and
 * body left as ordinary Markdown between them. That means the ObsidianFlavoredMarkdown
 * plugin still turns [[wikilinks]] inside the timeline into real links, and CrawlLinks
 * still records them for backlinks and the graph view.
 *
 * IMPORTANT: list this plugin BEFORE Plugin.ObsidianFlavoredMarkdown() in quartz.config.ts.
 */

export interface Options {
  /** Code block languages to treat as timelines. */
  languages: string[]
}

const defaultOptions: Options = {
  languages: ["timeline"],
}

interface TimelineEvent {
  date: string
  title: string
  body: string
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Parse the inside of a ```timeline block into style classes and events. */
export function parseTimeline(src: string): { classes: string[]; events: TimelineEvent[] } {
  const lines = src.split(/\r?\n/)
  const classes: string[] = []
  const fields: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === "") continue

    // optional "[class-a, class-b]" options line, before the first field
    if (fields.length === 0 && /^\[.*\]$/.test(trimmed)) {
      classes.push(
        ...trimmed
          .slice(1, -1)
          .split(",")
          .map((c) => c.trim())
          .filter((c) => /^[\w-]+$/.test(c)),
      )
      continue
    }

    if (trimmed.startsWith("+")) {
      // a new field (date, title or body)
      fields.push(trimmed.slice(1).trim())
    } else if (fields.length > 0) {
      // a continuation line: append it to the current field
      fields[fields.length - 1] += " " + trimmed
    }
  }

  const events: TimelineEvent[] = []
  for (let i = 0; i < fields.length; i += 3) {
    events.push({
      date: fields[i] ?? "",
      title: fields[i + 1] ?? "",
      body: fields[i + 2] ?? "",
    })
  }

  return { classes, events }
}

/**
 * Turn parsed events into Markdown with HTML wrappers.
 * Blank lines around the Markdown parts are essential: an HTML block ends at a blank line,
 * so the title and body get parsed as normal Markdown (links, bold, wikilinks...).
 */
function renderTimeline(classes: string[], events: TimelineEvent[]): string {
  const out: string[] = []
  out.push(`<div class="${["timeline", ...classes].join(" ")}">`)

  for (const ev of events) {
    out.push(`<div class="timeline-event">`)
    out.push(`<div class="timeline-marker" aria-hidden="true"></div>`)
    out.push(`<div class="timeline-card">`)
    out.push(`<div class="timeline-date">${escapeHtml(ev.date)}</div>`)
    if (ev.title) {
      out.push(`<div class="timeline-title">`, "", ev.title, "", `</div>`)
    }
    if (ev.body) {
      out.push(`<div class="timeline-body">`, "", ev.body, "", `</div>`)
    }
    out.push(`</div>`, `</div>`)
  }

  out.push(`</div>`)
  // surround with blank lines so it never merges into neighbouring paragraphs
  return "\n" + out.join("\n") + "\n"
}

export const Timeline: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }
  const langs = opts.languages.map(escapeRegex).join("|")
  // ```timeline ... ``` (or ~~~timeline ... ~~~), fence at the start of a line
  const blockRegex = new RegExp(
    String.raw`^(\`{3,}|~{3,})[ \t]*(?:${langs})[ \t]*\r?\n([\s\S]*?)^\1[ \t]*$`,
    "gm",
  )

  return {
    name: "Timeline",
    textTransform(_ctx, src) {
      if (src instanceof Buffer) {
        src = src.toString()
      }

      return src.replace(blockRegex, (_match, _fence, inner: string) => {
        const { classes, events } = parseTimeline(inner)
        if (events.length === 0) return ""
        return renderTimeline(classes, events)
      })
    },
  }
}
