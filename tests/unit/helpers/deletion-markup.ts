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

/** Render a tree whose only async component is ContactBlock (wherever it is nested). */
export async function renderWithContact(node: ReactNode): Promise<string> {
  const resolve = async (n: ReactNode): Promise<ReactNode> => {
    if (Array.isArray(n)) return Promise.all(n.map(resolve));
    if (!isValidElement(n)) return n;
    if (n.type === ContactBlock) return (ContactBlock as (p: unknown) => Promise<ReactElement>)(n.props);
    if (typeof n.type === "function" && (n.type as { name: string }).name === "AccountDeletionEs") return resolve((n.type as () => ReactElement)());
    if (typeof n.type === "function" && (n.type as { name: string }).name === "PublicPage") return resolve((n.props as { children: ReactNode }).children);
    const props = n.props as { children?: ReactNode };
    if (props.children === undefined || typeof n.type !== "string") return n;
    const kids = await resolve(props.children);
    return createElement(n.type, { ...(n.props as object), key: n.key ?? undefined, children: undefined }, ...(Array.isArray(kids) ? kids : [kids]));
  };
  return renderToStaticMarkup(createElement(Fragment, null, await resolve(node)));
}
