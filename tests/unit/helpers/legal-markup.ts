/** Renders the legal pages' bodies to static HTML so EN output can be compared byte for byte. */
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, Fragment, type ReactElement, type ReactNode } from "react";

type PageProps = { title: string; updated: string; dateLine?: string; children: ReactNode };

export function legalPageSnapshot(el: ReactElement) {
  const { title, updated, dateLine, children } = el.props as PageProps;
  return { title, updated, dateLine: dateLine ?? null, html: renderToStaticMarkup(createElement(Fragment, null, children)) };
}

export function html(el: ReactElement) {
  return renderToStaticMarkup(el);
}
