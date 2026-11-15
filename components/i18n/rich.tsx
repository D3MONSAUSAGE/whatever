import { Fragment, type ReactNode } from "react";

type Renderers = Record<string, (chunk: ReactNode) => ReactNode>;

const DEFAULTS: Renderers = {
  b: (c) => <b>{c}</b>,
  em: (c) => <em>{c}</em>,
};

/**
 * Renders a translated string that contains simple tags, e.g. "See <link>Support</link>." Tags are
 * only the ones the dictionary uses (no nesting, no attributes); anything else is shown as text.
 * Works in server and client components. Never pass customer-entered text here.
 */
export function rich(text: string, renderers: Renderers = {}): ReactNode[] {
  const all = { ...DEFAULTS, ...renderers };
  const out: ReactNode[] = [];
  const re = /<(\w+)>(.*?)<\/\1>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const render = all[m[1]];
    out.push(render ? <Fragment key={i++}>{render(m[2])}</Fragment> : m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
