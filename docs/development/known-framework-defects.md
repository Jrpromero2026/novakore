# Known framework defects (pinned Next.js)

Defects in the exactly-pinned upstream Next.js (`16.2.12`, ADR-028) that
the application works around. Re-test each on every deliberate version
bump; delete the entry and its workaround when a bump fixes it.

## Server-action response hangs when the current page awaits `searchParams`

**Found:** 2026-09-13, by the first mutating E2E spec (10-authoring-flow) —
its create-course submit never resolved. Reproduced in an interactive
browser; this affected real users on every paginated admin surface.

**Symptom.** Submit a form (`useActionState` / `startTransition`) whose
server action calls `revalidatePath`, while the CURRENT page reads its
`searchParams` prop (all paginated pages do). The action's database work
completes within seconds, the POST returns 200 headers — and the response
body stream never finishes. The form stays pending forever. Verified >60s
in both Playwright and an interactive Chromium; the same action submitted
from a page WITHOUT `searchParams` (e.g. the course builder) completes in
seconds.

**Mechanism** (from the framework source, `dist/server/request/search-params.js`
and `app-render.js`): when an action triggers an in-response re-render,
the page's `searchParams` promise is chained on
`asyncApiPromises.sharedSearchParamsParent`, which resolves only when the
staged-rendering controller advances to `RenderStage.Runtime`
(`stagedRendering.delayUntilStage(RenderStage.Runtime, …)`). In the
action-response render of a `searchParams`-reading page that advance never
happens, so `await searchParams` — and therefore the whole response
stream — hangs.

**Workaround (the convention, enforced by comments at every site):**
actions submitted **from paginated pages** must NOT `revalidatePath` their
own page. They return plain `ActionState` (an action that triggers no
revalidation "carries only its return value" and completes immediately),
and the calling client component refreshes via `router.refresh()` on
success — a normal GET, which streams correctly. Shared hook:
`apps/web/src/lib/use-refresh-on-success.ts` for `useActionState` forms;
transition-based callers call `router.refresh()` inline.

Surfaces converted (2026-09-13): courses (create), enrollments (assign /
withdraw / override), members (invite / status / roles), ops feedback
(triage, tester labels), assessments (create). Actions submitted from
non-paginated pages (course builder, lesson editor, studio, branding…)
keep their `revalidatePath` calls — they re-render fine.

**Do not** "fix" this by removing `searchParams` from a page or by adding
`revalidatePath` back with a different `type` — both were considered; the
first breaks pagination, the second re-renders the same hanging page.
