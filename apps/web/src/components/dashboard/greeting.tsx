"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * Time-of-day greeting for the viewer. The hour resolves from the viewer's
 * clock through useSyncExternalStore so the server render stays
 * time-neutral and hydration upgrades it without drift. `name` is the
 * viewer's own handle — the organization is never greeted as a person.
 */
export function Greeting({ name }: { name: string | null }) {
  const hour = useSyncExternalStore(
    noopSubscribe,
    () => new Date().getHours(),
    () => null,
  );

  const salutation =
    hour === null
      ? "Welcome back"
      : hour < 5
        ? "Working late"
        : hour < 12
          ? "Good morning"
          : hour < 18
            ? "Good afternoon"
            : "Good evening";

  return (
    <>
      {salutation}
      {name ? `, ${name}` : ""}
    </>
  );
}
