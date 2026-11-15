/** Static HTML of the /account-deletion body (the async ContactBlock is rendered separately). */
import { renderToStaticMarkup } from "react-dom/server";
import { Children, createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { ContactBlock } from "@/components/contact-block";

export async function deletionSnapshot(page: ReactElement) {
  let el = page;
  // Unwrap wrapper components (e.g. the ES page) down to the PublicPage element.
  while (typeof el.type === "function" && (el.type as { name: string }).name !== "PublicPage") el = (el.type as (p: unknown) => ReactElement)(el.props);
  const kids = Children.toArray((el.props as { children: ReactNode }).children);
  const contact = kids.find((k) => isValidElement(k) && k.type === ContactBlock) as ReactElement | undefined;
  const body = kids.filter((k) => k !== contact);
  const contactEl = contact ? await (ContactBlock as (p: unknown) => Promise<ReactElement>)(contact.props) : null;
  return { html: renderToStaticMarkup(createElement(Fragment, null, ...body)), contact: contactEl ? renderToStaticMarkup(contactEl) : null };
}
